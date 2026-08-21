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
  ArrowDownToLine,
  ArrowUpToLine,
  Brain,
  Check,
  CircleCheck,
  Drama,
  Eye,
  EyeOff,
  Focus,
  GraduationCap,
  KeyRound,
  Leaf,
  LibraryBig,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  MoonStar,
  PenLine,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  SunMedium,
  TriangleAlert,
  Trash2,
  Waves,
  Volume2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import vocabReaderIconUrl from "../../assets/icon/vocabreader-language-learning-v6.png";
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
import type { ListenRepeatDesktopApi } from "../shared/listen-repeat-contracts";
import type { ReviewDesktopApi } from "../shared/review-contracts";
import type { SentencePracticeDesktopApi } from "../shared/sentence-practice-contracts";
import type {
  SelectionSpeechDesktopApi,
  SelectionSpeechErrorCode,
  SelectionSpeechSettingsSnapshot,
  SelectionSpeechStreamEvent
} from "../shared/selection-speech-contracts";
import {
  AI_CONVERSATION_FONT_SIZE,
  DAILY_DUE_REVIEW_COMPLETION_LIMIT,
  DAILY_LISTEN_REPEAT_GOAL,
  DAILY_NEW_ITEM_COMPLETION_LIMIT,
  DAILY_SENTENCE_PRACTICE_GOAL,
  EBOOK_CONTENT_FONT_SIZE,
  EBOOK_LINE_HEIGHT,
  READING_PAPER_WIDTH,
  REVIEW_PAPER_SIZE,
  type AppSettings,
  type ExplanationLanguage,
  type LearningLanguage,
  type SelectionSpeechTone,
  type SelectionSpeechVoice,
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
import { ListenRepeatWorkspace } from "./ListenRepeatWorkspace";
import {
  LearningItemBatchAction,
  LearningItemDraftDialog
} from "./LearningItemDraftDialog";
import { ReadingPracticePaper } from "./ReadingPracticePaper";
import { SegmentRetellingPractice } from "./SegmentRetellingPractice";
import {
  SpacedReviewWorkspace,
  type ReviewWorkspaceStatus
} from "./SpacedReviewWorkspace";
import { SentencePracticeWorkspace } from "./SentencePracticeWorkspace";
import { readingPracticeArtifacts } from "./reading-practice-artifact";
import { segmentRetellingArtifacts } from "./segment-retelling-artifact";

type WorkspaceMode =
  | "overview"
  | "reader"
  | "learning-library"
  | "spaced-review"
  | "sentence-practice"
  | "listen-repeat";
type SettingsSection =
  | "general"
  | "practice"
  | "voice"
  | "account";

const DEFAULT_ASSISTANT_PANEL_WIDTH = 360;
const COLLAPSED_PANEL_WIDTH = 48;
const MIN_ASSISTANT_PANEL_WIDTH = 320;
const MAX_ASSISTANT_PANEL_WIDTH = 640;
const MIN_READING_AREA_WIDTH = 520;
const EXPANDED_LEFT_SIDEBAR_WIDTH = 240;
const SELECTION_SPEECH_WARNING_LENGTH = 1200;
const selectionSpeechVoiceLabels: Record<SelectionSpeechVoice, string> = {
  cedar: "Cedar",
  marin: "Marin",
  coral: "Coral",
  onyx: "Onyx"
};
const selectionSpeechToneLabels: Record<SelectionSpeechTone, string> = {
  learning: "Learning",
  natural: "Natural",
  calm: "Calm",
  expressive: "Expressive"
};
const COLLAPSED_LEFT_SIDEBAR_WIDTH = 48;
const ASSISTANT_PANEL_RESIZE_STEP = 16;

function normalizedSelectionSpeechLength(text: string): number {
  return text
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\r\n]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim().length;
}

interface ActiveSelectionSpeechPlayback {
  requestId: string;
  context?: AudioContext;
  sources: Set<AudioBufferSourceNode>;
  nextStartTime: number;
  remainder: Uint8Array;
  streamDone: boolean;
  started: boolean;
}

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
  sentencePractice?: SentencePracticeDesktopApi;
  listenRepeat?: ListenRepeatDesktopApi;
  settings?: SettingsDesktopApi;
  selectionSpeech?: SelectionSpeechDesktopApi;
  dataBackup?: DataBackupDesktopApi;
  chat?: ChatDesktopApi;
} | undefined {
  return (
    window as unknown as {
      readerDesktop?: {
        library?: LibraryDesktopApi;
        learning?: LearningDesktopApi;
        review?: ReviewDesktopApi;
        sentencePractice?: SentencePracticeDesktopApi;
        listenRepeat?: ListenRepeatDesktopApi;
        settings?: SettingsDesktopApi;
        selectionSpeech?: SelectionSpeechDesktopApi;
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

function desktopSentencePractice(): SentencePracticeDesktopApi | undefined {
  return desktopBridge()?.sentencePractice;
}

function desktopListenRepeat(): ListenRepeatDesktopApi | undefined {
  return desktopBridge()?.listenRepeat;
}

function desktopSettings(): SettingsDesktopApi | undefined {
  return desktopBridge()?.settings;
}

function desktopSelectionSpeech(): SelectionSpeechDesktopApi | undefined {
  return desktopBridge()?.selectionSpeech;
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
    .replace(/```reading-retelling-(?:task|grade)\s*\n[\s\S]*?\n```/g, "")
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
  const [selectionSpeechTarget, setSelectionSpeechTarget] = useState<{
    text: string;
    x: number;
    y: number;
  }>();
  const [speakingSelectionText, setSpeakingSelectionText] = useState<string>();
  const [selectionSpeechPhase, setSelectionSpeechPhase] =
    useState<"loading" | "playing">();
  const [selectionSpeechError, setSelectionSpeechError] = useState("");
  const [selectionSpeechErrorCode, setSelectionSpeechErrorCode] =
    useState<SelectionSpeechErrorCode>();
  const [isSelectionSpeechWarningOpen, setIsSelectionSpeechWarningOpen] =
    useState(false);
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
    learningLanguage: "en",
    explanationLanguage: "source",
    explanationLanguages: {
      en: "source",
      ja: "source",
      "zh-TW": "source"
    },
    aiConversationFontSize: AI_CONVERSATION_FONT_SIZE.default,
    ebookContentFontSize: EBOOK_CONTENT_FONT_SIZE.default,
    readingPaperWidth: READING_PAPER_WIDTH.default,
    ebookLineHeight: EBOOK_LINE_HEIGHT.default,
    dailyNewItemCompletionLimit: DAILY_NEW_ITEM_COMPLETION_LIMIT.default,
    dailyDueReviewCompletionLimit: DAILY_DUE_REVIEW_COMPLETION_LIMIT.default,
    dailySentencePracticeGoal: DAILY_SENTENCE_PRACTICE_GOAL.default,
    dailyListenRepeatGoal: DAILY_LISTEN_REPEAT_GOAL.default,
    reviewPaperSize: REVIEW_PAPER_SIZE.default,
    selectionSpeechVoice: "cedar",
    selectionSpeechTone: "learning"
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("general");
  const [isReadingLayoutOpen, setIsReadingLayoutOpen] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [unclassifiedLearningItemCount, setUnclassifiedLearningItemCount] =
    useState(0);
  const [unclassifiedTargetLanguage, setUnclassifiedTargetLanguage] =
    useState<LearningLanguage>("en");
  const [isAssigningUnclassifiedItems, setIsAssigningUnclassifiedItems] =
    useState(false);
  const [aiVoiceSettings, setAiVoiceSettings] =
    useState<SelectionSpeechSettingsSnapshot>({
      hasApiKey: false,
      voice: "cedar",
      tone: "learning"
    });
  const [aiVoiceApiKey, setAiVoiceApiKey] = useState("");
  const [isAiVoiceKeyVisible, setIsAiVoiceKeyVisible] = useState(false);
  const [isReplacingAiVoiceKey, setIsReplacingAiVoiceKey] = useState(false);
  const [aiVoiceDraft, setAiVoiceDraft] = useState<{
    voice: SelectionSpeechVoice;
    tone: SelectionSpeechTone;
  }>({ voice: "cedar", tone: "learning" });
  const [isAiVoiceApplying, setIsAiVoiceApplying] = useState(false);
  const [aiVoiceMessage, setAiVoiceMessage] = useState("");
  const [aiVoiceError, setAiVoiceError] = useState("");
  const [dataBackupOperation, setDataBackupOperation] = useState<
    "exporting" | "selecting" | "cancelling" | "restoring" | null
  >(null);
  const [dataBackupMessage, setDataBackupMessage] = useState("");
  const [dataBackupError, setDataBackupError] = useState("");
  const [dataRestorePreview, setDataRestorePreview] =
    useState<DataBackupPreview>();
  const [unlearnedNewCount, setUnlearnedNewCount] = useState(0);
  const [reviewAvailableCount, setReviewAvailableCount] = useState(0);
  const [
    dailySentencePracticeCompletedCount,
    setDailySentencePracticeCompletedCount
  ] = useState(0);
  const [dailyListenRepeatCompletedCount, setDailyListenRepeatCompletedCount] =
    useState(0);
  const [reviewSettingsRevision, setReviewSettingsRevision] = useState(0);
  const [reviewWorkspaceStatus, setReviewWorkspaceStatus] =
    useState<ReviewWorkspaceStatus>("idle");
  const [openLearningItemBatchId, setOpenLearningItemBatchId] =
    useState<string>();
  const [expandedReadingPracticeQuizId, setExpandedReadingPracticeQuizId] =
    useState<string>();
  const [expandedRetellingPracticeId, setExpandedRetellingPracticeId] =
    useState<string>();
  const [learningLibraryRevision, setLearningLibraryRevision] = useState(0);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const pendingChatScrollUserCountRef = useRef<number | null>(null);
  const rangeMenuRef = useRef<HTMLDivElement>(null);
  const selectionSpeechRef = useRef<HTMLButtonElement>(null);
  const selectionSpeechWarningRef = useRef<HTMLDivElement>(null);
  const readingLayoutRef = useRef<HTMLDivElement>(null);
  const dataRestoreCancelRef = useRef<HTMLButtonElement>(null);
  const initializedRangeRef = useRef<string | undefined>(undefined);
  const lastProvidedReadingSegmentRef = useRef<string | undefined>(undefined);
  const annotationCounterRef = useRef(0);
  const selectionSpeechRequestRef = useRef(0);
  const activeSelectionSpeechRef =
    useRef<ActiveSelectionSpeechPlayback | undefined>(undefined);
  const previewAudioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const previewAudioUrlRef = useRef<string | undefined>(undefined);
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
  const retellingPractice = useMemo(
    () => segmentRetellingArtifacts(chatSnapshot.messages),
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
        if (active) {
          setReviewAvailableCount(summary.totalAvailable);
          setUnlearnedNewCount(summary.newCount);
        }
      })
      .catch(() => {
        // The review workspace provides a retryable error when opened.
      });
    return () => {
      active = false;
    };
  }, [learningLibraryRevision]);

  useEffect(() => {
    const listenRepeat = desktopListenRepeat();
    if (!listenRepeat) return;
    let active = true;
    void listenRepeat.getSnapshot()
      .then((snapshot) => {
        if (active) {
          setDailyListenRepeatCompletedCount(
            snapshot.statistics.todayCompletedLongChunkCount
          );
        }
      })
      .catch(() => {
        // The Listen & Repeat workspace provides a retryable error when opened.
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
    void (api.getUnclassifiedLearningItemCount?.() ?? Promise.resolve(0))
      .then((count) => {
        if (active) setUnclassifiedLearningItemCount(count);
      })
      .catch(() => {
        if (active) setSettingsError("Unable to inspect unclassified learning items.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const api = desktopSelectionSpeech();
    if (!api) return;
    let active = true;
    void api.getSettings()
      .then((stored) => {
        if (!active) return;
        setAiVoiceSettings(stored);
        setAiVoiceDraft({ voice: stored.voice, tone: stored.tone });
        setIsReplacingAiVoiceKey(false);
      })
      .catch(() => {
        if (active) setAiVoiceError("Unable to load AI Voice settings.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    previewAudioRef.current?.pause();
    if (previewAudioUrlRef.current) {
      URL.revokeObjectURL(previewAudioUrlRef.current);
    }
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
    if (!article || !chapterContent) return;
    const handleMouseUp = () => {
      const selection = article.ownerDocument.getSelection();
      const selected = annotationRangeFromSelection(article, selection);
      if (!selected || !selection?.rangeCount) {
        setSelectionSpeechTarget(undefined);
        setIsSelectionSpeechWarningOpen(false);
        setSelectionSpeechError("");
        setSelectionSpeechErrorCode(undefined);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const x = Math.min(
        window.innerWidth - 52,
        Math.max(52, rect.left + rect.width / 2)
      );
      const y = Math.min(window.innerHeight - 44, Math.max(8, rect.bottom + 8));
      setSelectionSpeechTarget({ text: selected.text, x, y });
      setIsSelectionSpeechWarningOpen(false);
      setSelectionSpeechError("");
      setSelectionSpeechErrorCode(undefined);
      if (
        isAnnotationMode &&
        !hasAnnotationOverlap(annotations, selected)
      ) {
        createAnnotation(selected);
      }
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
      if (selection) {
        setSelectionSpeechTarget({
          text: selection.text,
          x: Math.min(window.innerWidth - 52, Math.max(52, event.clientX)),
          y: Math.min(window.innerHeight - 44, Math.max(8, event.clientY + 8))
        });
        setIsSelectionSpeechWarningOpen(false);
        setSelectionSpeechError("");
        setSelectionSpeechErrorCode(undefined);
      }
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
    if (!selectionSpeechTarget) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        selectionSpeechRef.current?.contains(event.target as Node) ||
        selectionSpeechWarningRef.current?.contains(event.target as Node) ||
        rangeMenuRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setSelectionSpeechTarget(undefined);
      setIsSelectionSpeechWarningOpen(false);
      setSelectionSpeechError("");
      setSelectionSpeechErrorCode(undefined);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [selectionSpeechTarget]);

  useEffect(() => {
    stopSelectionSpeech();
    setSelectionSpeechTarget(undefined);
    setIsSelectionSpeechWarningOpen(false);
    setSelectionSpeechError("");
    setSelectionSpeechErrorCode(undefined);
  }, [mode, selectedBookId, activeChapterId]);

  useEffect(() => {
    const api = desktopSelectionSpeech();
    if (!api) return;
    const unsubscribe = api.onEvent(handleSelectionSpeechStreamEvent);
    return () => {
      unsubscribe();
      stopSelectionSpeech();
    };
  }, []);

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

  function stopSelectionSpeech() {
    selectionSpeechRequestRef.current += 1;
    const active = activeSelectionSpeechRef.current;
    activeSelectionSpeechRef.current = undefined;
    if (active) {
      void desktopSelectionSpeech()?.cancel(active.requestId);
      for (const source of active.sources) {
        try {
          source.stop();
        } catch {
          // A source that already ended needs no further cleanup.
        }
      }
      void active.context?.close();
    }
    setSpeakingSelectionText(undefined);
    setSelectionSpeechPhase(undefined);
  }

  function finishSelectionSpeech(requestId: string) {
    const active = activeSelectionSpeechRef.current;
    if (!active || active.requestId !== requestId) return;
    activeSelectionSpeechRef.current = undefined;
    void active.context?.close();
    setSpeakingSelectionText(undefined);
    setSelectionSpeechPhase(undefined);
  }

  function scheduleSelectionSpeechAudio(
    active: ActiveSelectionSpeechPlayback,
    incoming: Uint8Array
  ) {
    const joined = new Uint8Array(active.remainder.byteLength + incoming.byteLength);
    joined.set(active.remainder);
    joined.set(incoming, active.remainder.byteLength);
    const completeLength = joined.byteLength - (joined.byteLength % 2);
    active.remainder = joined.slice(completeLength);
    if (!completeLength) return;

    const AudioContextConstructor = globalThis.AudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Audio playback is not supported on this device.");
    }
    const context = active.context ?? new AudioContextConstructor({ sampleRate: 24_000 });
    active.context = context;
    if (context.state === "suspended") void context.resume();

    const sampleCount = completeLength / 2;
    const samples = new Float32Array(sampleCount);
    const view = new DataView(joined.buffer, joined.byteOffset, completeLength);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getInt16(index * 2, true) / 32_768;
    }
    const buffer = context.createBuffer(1, sampleCount, 24_000);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startTime = Math.max(
      context.currentTime + (active.started ? 0.01 : 0.04),
      active.nextStartTime
    );
    active.nextStartTime = startTime + buffer.duration;
    active.started = true;
    active.sources.add(source);
    source.onended = () => {
      active.sources.delete(source);
      if (active.streamDone && active.sources.size === 0) {
        finishSelectionSpeech(active.requestId);
      }
    };
    source.start(startTime);
    setSelectionSpeechPhase("playing");
  }

  function handleSelectionSpeechStreamEvent(event: SelectionSpeechStreamEvent) {
    const active = activeSelectionSpeechRef.current;
    if (!active || active.requestId !== event.requestId) return;
    if (event.type === "audio") {
      try {
        scheduleSelectionSpeechAudio(active, event.audio);
      } catch (error) {
        stopSelectionSpeech();
        setSelectionSpeechError(
          error instanceof Error ? error.message : "Unable to play AI pronunciation."
        );
        setSelectionSpeechErrorCode("service");
      }
      return;
    }
    if (event.type === "done") {
      active.streamDone = true;
      if (active.sources.size === 0) finishSelectionSpeech(event.requestId);
      return;
    }
    activeSelectionSpeechRef.current = undefined;
    for (const source of active.sources) {
      try {
        source.stop();
      } catch {
        // Ignore sources that already ended.
      }
    }
    void active.context?.close();
    setSpeakingSelectionText(undefined);
    setSelectionSpeechPhase(undefined);
    setSelectionSpeechError(event.message);
    setSelectionSpeechErrorCode(event.code);
  }

  async function pronounceSelection(text: string, isLongSelectionConfirmed = false) {
    setSelectionSpeechError("");
    setSelectionSpeechErrorCode(undefined);
    const api = desktopSelectionSpeech();
    if (!aiVoiceSettings.hasApiKey || !api) {
      setSelectionSpeechError(
        "Set up AI Voice in Settings before playing selected text."
      );
      setSelectionSpeechErrorCode("not-configured");
      setActiveSettingsSection("voice");
      setIsSettingsOpen(true);
      return;
    }
    if (
      !isLongSelectionConfirmed &&
      normalizedSelectionSpeechLength(text) > SELECTION_SPEECH_WARNING_LENGTH
    ) {
      stopSelectionSpeech();
      setIsSelectionSpeechWarningOpen(true);
      return;
    }
    setIsSelectionSpeechWarningOpen(false);
    stopSelectionSpeech();
    const revision = selectionSpeechRequestRef.current;
    setSpeakingSelectionText(text);
    setSelectionSpeechPhase("loading");
    try {
      const { requestId } = await api.start({ text });
      if (selectionSpeechRequestRef.current !== revision) {
        void api.cancel(requestId);
        return;
      }
      activeSelectionSpeechRef.current = {
        requestId,
        sources: new Set(),
        nextStartTime: 0,
        remainder: new Uint8Array(),
        streamDone: false,
        started: false
      };
    } catch (error) {
      if (selectionSpeechRequestRef.current !== revision) return;
      setSpeakingSelectionText(undefined);
      setSelectionSpeechPhase(undefined);
      setSelectionSpeechError(
        error instanceof Error ? error.message : "Unable to start AI pronunciation."
      );
      setSelectionSpeechErrorCode("service");
    }
  }

  function playAiVoicePreview(audio: Uint8Array) {
    if (!audio.byteLength || typeof Audio === "undefined") return;
    previewAudioRef.current?.pause();
    if (previewAudioUrlRef.current) {
      URL.revokeObjectURL(previewAudioUrlRef.current);
    }
    const previewBytes = new Uint8Array(audio.byteLength);
    previewBytes.set(audio);
    const url = URL.createObjectURL(new Blob(
      [previewBytes.buffer],
      { type: "audio/wav" }
    ));
    const player = new Audio(url);
    previewAudioRef.current = player;
    previewAudioUrlRef.current = url;
    const release = () => {
      if (previewAudioUrlRef.current !== url) return;
      URL.revokeObjectURL(url);
      previewAudioUrlRef.current = undefined;
      previewAudioRef.current = undefined;
    };
    player.addEventListener("ended", release, { once: true });
    player.addEventListener("error", release, { once: true });
    void player.play().catch(() => {
      setAiVoiceError("The settings were applied, but the preview could not play.");
      release();
    });
  }

  async function applyAiVoiceSettings() {
    const api = desktopSelectionSpeech();
    if (!api) {
      setAiVoiceError("AI Voice is not available in this build.");
      return;
    }
    setIsAiVoiceApplying(true);
    setAiVoiceError("");
    setAiVoiceMessage("");
    try {
      const result = await api.applySettings({
        ...(aiVoiceApiKey.trim() ? { apiKey: aiVoiceApiKey } : {}),
        voice: aiVoiceDraft.voice,
        tone: aiVoiceDraft.tone
      });
      setAiVoiceSettings(result.settings);
      setAiVoiceDraft({
        voice: result.settings.voice,
        tone: result.settings.tone
      });
      setSettings((current) => ({
        ...current,
        selectionSpeechVoice: result.settings.voice,
        selectionSpeechTone: result.settings.tone
      }));
      setAiVoiceApiKey("");
      setIsAiVoiceKeyVisible(false);
      setIsReplacingAiVoiceKey(false);
      setAiVoiceMessage("AI Voice settings applied. Previewing the selected voice.");
      playAiVoicePreview(result.previewAudio);
    } catch (error) {
      setAiVoiceError(
        error instanceof Error ? error.message : "Unable to apply AI Voice settings."
      );
    } finally {
      setIsAiVoiceApplying(false);
    }
  }

  async function removeAiVoiceApiKey() {
    const api = desktopSelectionSpeech();
    if (!api) return;
    setIsAiVoiceApplying(true);
    setAiVoiceError("");
    setAiVoiceMessage("");
    try {
      const next = await api.removeApiKey();
      setAiVoiceSettings(next);
      setAiVoiceDraft({ voice: next.voice, tone: next.tone });
      setAiVoiceApiKey("");
      setIsAiVoiceKeyVisible(false);
      setIsReplacingAiVoiceKey(false);
      setAiVoiceMessage("OpenAI API key removed.");
      stopSelectionSpeech();
    } catch (error) {
      setAiVoiceError(
        error instanceof Error ? error.message : "Unable to remove the API key."
      );
    } finally {
      setIsAiVoiceApplying(false);
    }
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
      return saved;
    } catch {
      if (revision === settingsSaveRevisionRef.current) {
        setSettingsError("Unable to save settings. Please try again.");
      }
    } finally {
      if (revision === settingsSaveRevisionRef.current) {
        setIsSettingsSaving(false);
      }
    }
    return undefined;
  }

  function saveExplanationLanguage(value: ExplanationLanguage) {
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
      settingsSaveTimerRef.current = undefined;
    }
    const next = {
      ...settings,
      explanationLanguage: value,
      explanationLanguages: {
        ...settings.explanationLanguages,
        [settings.learningLanguage]: value
      }
    };
    setSettings(next);
    void persistSettings(next);
  }

  async function saveLearningLanguage(value: LearningLanguage) {
    if (value === settings.learningLanguage || isSettingsSaving) return;
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
      settingsSaveTimerRef.current = undefined;
    }
    const next = {
      ...settings,
      learningLanguage: value,
      explanationLanguage: settings.explanationLanguages[value]
    };
    setSettings(next);
    const saved = await persistSettings(next);
    if (!saved) return;

    setMode("overview");
    setBooks([]);
    setSelectedBookId(undefined);
    setActiveChapterId(undefined);
    setChapterContent(undefined);
    setReadingRange(undefined);
    setAnnotations([]);
    setDraft("");
    setChatView("conversation");
    setExpandedReadingPracticeQuizId(undefined);
    setExpandedRetellingPracticeId(undefined);
    setOpenLearningItemBatchId(undefined);
    setLearningLibraryRevision((current) => current + 1);
    const library = desktopLibrary();
    if (!library) return;
    try {
      const storedBooks = await library.listBooks();
      setBooks(storedBooks);
      if (storedBooks[0]) restoreBook(storedBooks[0]);
    } catch {
      setLibraryError("Unable to load the selected learning-language workspace.");
    }
  }

  async function assignUnclassifiedItems() {
    const api = desktopSettings();
    if (!api?.assignUnclassifiedLearningItems || !unclassifiedLearningItemCount ||
      isAssigningUnclassifiedItems) {
      return;
    }
    setIsAssigningUnclassifiedItems(true);
    setSettingsError("");
    try {
      const assigned = await api.assignUnclassifiedLearningItems(
        unclassifiedTargetLanguage
      );
      setUnclassifiedLearningItemCount(0);
      setLearningLibraryRevision((current) => current + 1);
      setDataBackupMessage(
        `Moved ${assigned} unclassified learning item${assigned === 1 ? "" : "s"} to ${
          unclassifiedTargetLanguage === "en"
            ? "English"
            : unclassifiedTargetLanguage === "ja" ? "Japanese" : "Traditional Chinese"
        }.`
      );
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Unable to assign unclassified learning items."
      );
    } finally {
      setIsAssigningUnclassifiedItems(false);
    }
  }

  function previewSetting(
    field:
      | "aiConversationFontSize"
      | "ebookContentFontSize"
      | "readingPaperWidth"
      | "ebookLineHeight"
      | "dailyNewItemCompletionLimit"
      | "dailyDueReviewCompletionLimit"
      | "dailySentencePracticeGoal"
      | "dailyListenRepeatGoal"
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
    const scroller = contentRef.current;
    const target = scroller
      ?.querySelector<HTMLElement>(`[data-range-boundary="${marker}"]`);
    if (!scroller || !target) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const viewportFraction = marker === "start" ? 1 / 4 : 3 / 4;
    const targetCenter = targetRect.top + targetRect.height / 2;
    const desiredCenter = scrollerRect.top + scroller.clientHeight * viewportFraction;
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.min(
      maximum,
      Math.max(0, scroller.scrollTop + targetCenter - desiredCenter)
    );
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
        extras.intent === "practiceRetelling" ||
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

  async function practiceRetelling() {
    setExpandedRetellingPracticeId(undefined);
    return sendChatMessage("Start retelling practice", {
      intent: "practiceRetelling",
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
          <img
            alt=""
            aria-hidden="true"
            className="brand-mark"
            draggable={false}
            src={vocabReaderIconUrl}
          />
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
              {books.length ? (
                <section className="book-library-panel" aria-label="Book library">
                  <div className="book-list" aria-label="Imported books">
                    {books.map((book) => (
                      <button
                        className={book.id === selectedBook?.id ? "book-item active" : "book-item"}
                        key={book.id}
                        type="button"
                        aria-label={`${book.title}, ${book.author}, ${book.progressPercent}% read`}
                        aria-pressed={book.id === selectedBook?.id}
                        onClick={() => selectBook(book.id)}
                      >
                        <span className="book-item-cover" aria-hidden="true">
                          {book.coverDataUrl ? <img src={book.coverDataUrl} alt="" /> : "Aa"}
                        </span>
                        <span className="book-item-copy">
                          <strong title={book.title}>{book.title}</strong>
                          <small title={book.author}>{book.author}</small>
                          <span className="book-progress" aria-hidden="true">
                            <span
                              style={{
                                width: `${Math.min(100, Math.max(0, book.progressPercent))}%`
                              }}
                            />
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

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
                    className={mode === "sentence-practice" ? "nav-item active" : "nav-item"}
                    aria-label={settings.dailySentencePracticeGoal > 0
                      ? `Sentence Practice ${Math.max(
                          settings.dailySentencePracticeGoal -
                            dailySentencePracticeCompletedCount,
                          0
                        )}`
                      : "Sentence Practice"}
                    onClick={() => {
                      saveCurrentReaderPosition();
                      setMode("sentence-practice");
                    }}
                  >
                    <PenLine
                      className="sidebar-action-icon"
                      aria-hidden="true"
                      strokeWidth={1.8}
                    />
                    <span className="nav-item-label">Sentence Practice</span>
                    {settings.dailySentencePracticeGoal > 0 ? (
                      <em>{Math.max(
                        settings.dailySentencePracticeGoal -
                          dailySentencePracticeCompletedCount,
                        0
                      )}</em>
                    ) : null}
                  </button>
                  <button
                    className={mode === "listen-repeat" ? "nav-item active" : "nav-item"}
                    aria-label={settings.dailyListenRepeatGoal > 0
                      ? `Listen & Repeat ${Math.max(
                          settings.dailyListenRepeatGoal -
                            dailyListenRepeatCompletedCount,
                          0
                        )}`
                      : "Listen & Repeat"}
                    onClick={() => {
                      saveCurrentReaderPosition();
                      setIsRightSidebarCollapsed(true);
                      setMode("listen-repeat");
                    }}
                  >
                    <Waves
                      className="sidebar-action-icon"
                      aria-hidden="true"
                      strokeWidth={1.8}
                    />
                    <span className="nav-item-label">Listen & Repeat</span>
                    {settings.dailyListenRepeatGoal > 0 ? (
                      <em>{Math.max(
                        settings.dailyListenRepeatGoal -
                          dailyListenRepeatCompletedCount,
                        0
                      )}</em>
                    ) : null}
                  </button>
                  <button
                    className={mode === "learning-library" ? "nav-item active" : "nav-item"}
                    aria-label={`Library ${unlearnedNewCount}`}
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
                    <em>{unlearnedNewCount}</em>
                  </button>
                </nav>
              </div>

              <div className="sidebar-utilities">
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
                  : mode === "sentence-practice"
                    ? "content sentence-practice-content"
                    : mode === "listen-repeat"
                      ? "content listen-repeat-content"
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
              onNewCountChange={setUnlearnedNewCount}
              onLearningCountsChange={() => {
                void desktopReview()?.getSummary()
                  .then((summary) => {
                    setReviewAvailableCount(summary.totalAvailable);
                    setUnlearnedNewCount(summary.newCount);
                  })
                  .catch(() => {
                    // The review workspace provides a retryable error.
                  });
              }}
              onStatusChange={setReviewWorkspaceStatus}
            />
          ) : null}

          {desktopSentencePractice() && desktopLearning() ? (
            <SentencePracticeWorkspace
              api={desktopSentencePractice()!}
              learningApi={desktopLearning()!}
              reviewApi={desktopReview()}
              explanationLanguage={settings.explanationLanguage}
              dailyGoal={settings.dailySentencePracticeGoal}
              onDailyCompletedItemCountChange={
                setDailySentencePracticeCompletedCount
              }
              active={mode === "sentence-practice"}
            />
          ) : null}

          {desktopListenRepeat() ? (
            <ListenRepeatWorkspace
              api={desktopListenRepeat()!}
              active={mode === "listen-repeat"}
              dailyGoal={settings.dailyListenRepeatGoal}
              onTodayCompletedLongChunkCountChange={
                setDailyListenRepeatCompletedCount
              }
              onOpenAiVoice={() => {
                setActiveSettingsSection("voice");
                setIsSettingsOpen(true);
              }}
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
                    <div className="overview-actions">
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
                          <span className="chapter-marker">
                            {depth > 0 ? null : String(chapter.order + 1).padStart(2, "0")}
                          </span>
                          <span className="chapter-title">
                            {depth > 0 ? <small>Section</small> : null}
                            <strong>{chapter.title}</strong>
                          </span>
                          <em>
                            <span>{depth > 0 ? "Read section" : "Open chapter"}</span>
                            <b aria-hidden="true">→</b>
                          </em>
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
                    <div className="reading-range-actions-group">
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
                          <span aria-hidden="true">↑</span>
                          <span>Start</span>
                        </button>
                        <button
                          className="end"
                          type="button"
                          aria-label="Go to END range marker"
                          onClick={() => scrollToReadingRangeMarker("end")}
                        >
                          <span aria-hidden="true">↓</span>
                          <span>End</span>
                        </button>
                      </div>
                      <button
                        className="range-advance-action"
                        type="button"
                        aria-label="Go to next reading segment"
                        onClick={advanceToNextReadingRange}
                        disabled={!readingRange || readingRange.end >= (articleRef.current?.textContent?.length ?? 0)}
                      >
                        <span>Next segment</span>
                        <span aria-hidden="true">→</span>
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
                      {annotations.length > 0 ? (
                        <span className="annotation-tool-count" aria-hidden="true">
                          {annotations.length}
                        </span>
                      ) : null}
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
                  {selectionSpeechTarget ? (
                    <>
                      {isSelectionSpeechWarningOpen ? (
                        <div
                          ref={selectionSpeechWarningRef}
                          className="selection-speech-warning"
                          role="alert"
                          style={{
                            left: Math.min(
                              window.innerWidth - 176,
                              Math.max(176, selectionSpeechTarget.x)
                            ),
                            top: Math.min(
                              window.innerHeight - 202,
                              Math.max(12, selectionSpeechTarget.y)
                            )
                          }}
                        >
                          <span className="selection-speech-warning-icon" aria-hidden="true">
                            <TriangleAlert />
                          </span>
                          <div className="selection-speech-warning-content">
                            <strong>Long selection</strong>
                            <span>
                              {normalizedSelectionSpeechLength(selectionSpeechTarget.text)}
                              {" characters selected"}
                            </span>
                            <p>
                              Generating this much audio may take longer and use more
                              of your OpenAI API credits.
                            </p>
                            <div className="selection-speech-warning-actions">
                              <button
                                type="button"
                                onClick={() => setIsSelectionSpeechWarningOpen(false)}
                              >
                                Cancel
                              </button>
                              <button
                                className="primary"
                                type="button"
                                onClick={() => void pronounceSelection(
                                  selectionSpeechTarget.text,
                                  true
                                )}
                              >
                                <Volume2 aria-hidden="true" />
                                Generate voice
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          ref={selectionSpeechRef}
                          className={`selection-speech-action${
                            speakingSelectionText === selectionSpeechTarget.text
                              ? ` is-speaking is-${selectionSpeechPhase ?? "loading"}`
                              : ""
                          }`}
                          type="button"
                          aria-label={
                            speakingSelectionText === selectionSpeechTarget.text
                              ? "Stop pronunciation"
                              : "Pronounce selected text"
                          }
                          style={{
                            left: speakingSelectionText === selectionSpeechTarget.text
                              ? Math.min(
                                  window.innerWidth - 144,
                                  Math.max(144, selectionSpeechTarget.x)
                                )
                              : selectionSpeechTarget.x,
                            top: selectionSpeechTarget.y
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            if (speakingSelectionText === selectionSpeechTarget.text) {
                              stopSelectionSpeech();
                            } else {
                              void pronounceSelection(selectionSpeechTarget.text);
                            }
                          }}
                        >
                          {speakingSelectionText === selectionSpeechTarget.text ? (
                            <>
                              <span className="selection-speech-activity" aria-hidden="true">
                                {selectionSpeechPhase === "playing" ? (
                                  <span className="selection-speech-equalizer">
                                    <span />
                                    <span />
                                    <span />
                                  </span>
                                ) : (
                                  <LoaderCircle className="selection-speech-spinner" />
                                )}
                              </span>
                              <span className="selection-speech-copy">
                                <span role="status" aria-live="polite">
                                  {selectionSpeechPhase === "playing"
                                    ? "Playing selected text"
                                    : "Generating AI voice…"}
                                </span>
                                <small>
                                  {selectionSpeechVoiceLabels[aiVoiceSettings.voice]}
                                  {" · "}
                                  {selectionSpeechToneLabels[aiVoiceSettings.tone]}
                                </small>
                              </span>
                              <span className="selection-speech-stop" aria-hidden="true">
                                <Square fill="currentColor" />
                                <span>Stop</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <Volume2 aria-hidden="true" />
                              <span>Pronounce</span>
                            </>
                          )}
                        </button>
                      )}
                      {selectionSpeechError ? (
                        <div
                          className="selection-speech-error"
                          style={{
                            left: selectionSpeechTarget.x,
                            top: selectionSpeechTarget.y + 42
                          }}
                        >
                          <p role="status">{selectionSpeechError}</p>
                          <div className="selection-speech-error-actions">
                            {selectionSpeechErrorCode !== "not-configured" ? (
                              <button
                                type="button"
                                onClick={() => void pronounceSelection(
                                  selectionSpeechTarget.text
                                )}
                              >
                                Retry
                              </button>
                            ) : null}
                            {selectionSpeechErrorCode === "auth" ||
                            selectionSpeechErrorCode === "not-configured" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSettingsSection("voice");
                                  setIsSettingsOpen(true);
                                }}
                              >
                                Open AI Voice Settings
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
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
                        <ArrowUpToLine aria-hidden="true" />
                        <span>Move start here</span>
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => moveRangeMarker("end", rangeMenu.offset)}
                      >
                        <ArrowDownToLine aria-hidden="true" />
                        <span>Move end here</span>
                      </button>
                      {rangeMenu.selection ? (
                        <>
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              void pronounceSelection(rangeMenu.selection!.text);
                              setRangeMenu(undefined);
                            }}
                          >
                            <Volume2 aria-hidden="true" />
                            <span>Pronounce selection</span>
                          </button>
                          <button
                            role="menuitem"
                            type="button"
                            onClick={() => createAnnotation(rangeMenu.selection!)}
                          >
                            <PenLine aria-hidden="true" />
                            <span>Annotate selection</span>
                          </button>
                        </>
                      ) : null}
                      {rangeMenu.annotationId ? (
                        <button
                          className="range-menu-danger"
                          role="menuitem"
                          type="button"
                          onClick={() => removeAnnotation(rangeMenu.annotationId!)}
                        >
                          <Trash2 aria-hidden="true" />
                          <span>Remove annotation</span>
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
          ) : mode === "sentence-practice" ? (
            desktopSentencePractice() && desktopLearning() ? null : (
              <section className="learning-library-panel" aria-labelledby="sentence-practice-fallback-title">
                <span className="eyebrow">Active English writing</span>
                <h1 id="sentence-practice-fallback-title">Sentence Practice</h1>
                <p className="library-error" role="alert">
                  Sentence practice is currently unavailable.
                </p>
              </section>
            )
          ) : mode === "listen-repeat" ? (
            desktopListenRepeat() ? null : (
              <section className="learning-library-panel" aria-labelledby="listen-repeat-fallback-title">
                <span className="eyebrow">Pronunciation practice</span>
                <h1 id="listen-repeat-fallback-title">Listen & Repeat Practice</h1>
                <p className="library-error" role="alert">
                  Listen & Repeat is currently unavailable.
                </p>
              </section>
            )
          ) : (
            desktopLearning() ? (
              <LearningLibraryWorkspace
                key={learningLibraryRevision}
                api={desktopLearning()!}
                reviewApi={desktopReview()}
                onCountsChange={() => {
                  void desktopReview()?.getSummary()
                    .then((summary) => {
                      setReviewAvailableCount(summary.totalAvailable);
                      setUnlearnedNewCount(summary.newCount);
                    })
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
                      <h2 id="conversation-history-title">10 most recent conversations</h2>
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
                    className={chatSnapshot.messages.length === 0
                      ? "messages empty-messages"
                      : "messages"}
                    aria-live="polite"
                    ref={chatMessagesRef}
                  >
                    {chatSnapshot.messages.length === 0 ? (
                      <>
                        <section className="chat-context-card" aria-label="AI context">
                          <span>AI context</span>
                          <strong>START → END only</strong>
                          <p>Each question includes only the current marked segment.</p>
                        </section>
                        <div className="chat-learning-prompt">
                          <span className="chat-learning-prompt-icon" aria-hidden="true">
                            ✦
                          </span>
                          <strong>Ask to learn</strong>
                          <p>
                            Try “What does this phrase mean in context?” or
                            <br />
                            “How would a native speaker use it?”
                          </p>
                        </div>
                      </>
                    ) : null}
                    {chatSnapshot.messages.map((message) => {
                      const messagePractice = readingPracticeArtifacts([message]);
                      const messageQuiz = messagePractice.quiz;
                      const isCurrentQuiz = Boolean(
                        messageQuiz &&
                        messageQuiz.quizId === readingPractice.quiz?.quizId
                      );
                      const messageRetelling = segmentRetellingArtifacts([message]);
                      const messageRetellingTask = messageRetelling.task;
                      const isCurrentRetelling = Boolean(
                        messageRetellingTask &&
                        messageRetellingTask.practiceId ===
                          retellingPractice.task?.practiceId
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
                          {isCurrentRetelling && messageRetellingTask ? (
                            <SegmentRetellingPractice
                              open={expandedRetellingPracticeId ===
                                messageRetellingTask.practiceId}
                              messages={chatSnapshot.messages}
                              onOpen={() => setExpandedRetellingPracticeId(
                                messageRetellingTask.practiceId
                              )}
                              onClose={() => setExpandedRetellingPracticeId(
                                undefined
                              )}
                              onSubmit={(text) => sendChatMessage(text, {
                                explanationLanguage: settings.explanationLanguage
                              })}
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
                    <div
                      className={mode === "reader"
                        ? "chat-preset-bar reader-chat-preset-bar"
                        : "chat-preset-bar"}
                      aria-label="Question shortcuts"
                    >
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
                      {mode === "reader" ? (
                        <button
                          className="annotation-analysis-preset reading-practice-preset retelling-practice-preset"
                          type="button"
                          onClick={() => void practiceRetelling()}
                          disabled={chatSnapshot.connection !== "ready" ||
                            Boolean(chatSnapshot.activeTurnId) ||
                            chatSnapshot.managementBusy ||
                            isConversationActionPending ||
                            !readingRange}
                        >
                          <svg aria-hidden="true" viewBox="0 0 18 18">
                            <path d="M4 4.25h8.25a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2H7l-3 2v-11.5Z" />
                            <path d="M6.5 7h5M6.5 9.5h3.75" />
                          </svg>
                          <span>Retelling practice</span>
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
                      placeholder={mode === "reader"
                        ? "Ask about the marked passage…"
                        : "Ask a language-learning question…"}
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
                id="settings-tab-practice"
                aria-selected={activeSettingsSection === "practice"}
                aria-controls="settings-panel-practice"
                onClick={() => setActiveSettingsSection("practice")}
              >
                Practice
              </button>
              <button
                type="button"
                role="tab"
                id="settings-tab-voice"
                aria-selected={activeSettingsSection === "voice"}
                aria-controls="settings-panel-voice"
                onClick={() => setActiveSettingsSection("voice")}
              >
                AI Voice
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
                  <p>Choose an isolated learning workspace and its AI explanation language.</p>
                </div>
                <div className="settings-control">
                  <label htmlFor="learning-language">Learning language</label>
                  <select
                    id="learning-language"
                    aria-label="Learning language"
                    value={settings.learningLanguage}
                    disabled={isSettingsSaving || Boolean(dataBackupOperation) ||
                      Boolean(chatSnapshot.activeTurnId) ||
                      chatSnapshot.managementBusy ||
                      isConversationActionPending ||
                      reviewWorkspaceStatus !== "idle"}
                    onChange={(event) => void saveLearningLanguage(
                      event.target.value as LearningLanguage
                    )}
                  >
                    <option value="en">English</option>
                    <option value="ja">Japanese</option>
                    <option value="zh-TW">Traditional Chinese</option>
                  </select>
                  <p>Switches books, learning items, practice progress, and AI conversations as one workspace.</p>
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
                    <option value="source">Same as learning language (default)</option>
                    <option value="zh-TW">Traditional Chinese</option>
                    <option value="en">English</option>
                    <option value="ja">Japanese</option>
                  </select>
                  <p>
                    Applies to AI responses, teaching and grading explanations, annotation
                    explanations, and learning-item explanations. Quiz questions and answers
                    stay in the learning language.
                  </p>
                </div>
                {unclassifiedLearningItemCount > 0 ? (
                  <div className="settings-control">
                    <label htmlFor="unclassified-learning-language">
                      Unclassified legacy learning items
                    </label>
                    <p>
                      {unclassifiedLearningItemCount} item{
                        unclassifiedLearningItemCount === 1 ? "" : "s"
                      } from the previous library need a learning workspace.
                    </p>
                    <select
                      id="unclassified-learning-language"
                      value={unclassifiedTargetLanguage}
                      disabled={isAssigningUnclassifiedItems}
                      onChange={(event) => setUnclassifiedTargetLanguage(
                        event.target.value as LearningLanguage
                      )}
                    >
                      <option value="en">English</option>
                      <option value="ja">Japanese</option>
                      <option value="zh-TW">Traditional Chinese</option>
                    </select>
                    <button
                      type="button"
                      disabled={isAssigningUnclassifiedItems}
                      onClick={() => void assignUnclassifiedItems()}
                    >
                      {isAssigningUnclassifiedItems ? "Moving…" : "Move all items"}
                    </button>
                  </div>
                ) : null}
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
                    learning items, and review history, plus sentence-practice
                    activity for all three learning-language workspaces. Shared
                    settings and each workspace&apos;s explanation language are included.
                    AI conversations and Codex sign-in are not included.
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
            {activeSettingsSection === "practice" ? (
              <section
                className="settings-panel"
                role="tabpanel"
                id="settings-panel-practice"
                aria-labelledby="settings-tab-practice"
              >
                <section className="settings-practice-section">
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
                <section className="settings-practice-section">
                <div className="settings-section-intro">
                  <h3>Sentence Practice</h3>
                  <p>
                    Set how many learning items you want to use in completed
                    writing practices each day.
                  </p>
                </div>
                <fieldset className="settings-number-list">
                  <legend className="visually-hidden">Sentence Practice</legend>
                  <div className="settings-number-control">
                    <div>
                      <label htmlFor="daily-sentence-practice-goal">
                        Daily learning-item goal
                      </label>
                      <p>
                        Only practices that pass the required-item check count;
                        0 hides the goal without disabling practice.
                      </p>
                    </div>
                    <input
                      id="daily-sentence-practice-goal"
                      type="number"
                      min={DAILY_SENTENCE_PRACTICE_GOAL.min}
                      max={DAILY_SENTENCE_PRACTICE_GOAL.max}
                      step="1"
                      value={settings.dailySentencePracticeGoal}
                      onChange={(event) => previewSetting(
                        "dailySentencePracticeGoal",
                        Number(event.target.value)
                      )}
                    />
                  </div>
                </fieldset>
                </section>
                <section className="settings-practice-section">
                <div className="settings-section-intro">
                  <h3>Listen &amp; Repeat</h3>
                  <p>
                    Set how many full sentences you want to record for the first
                    time each day.
                  </p>
                </div>
                <fieldset className="settings-number-list">
                  <legend className="visually-hidden">Listen &amp; Repeat</legend>
                  <div className="settings-number-control">
                    <div>
                      <label htmlFor="daily-listen-repeat-goal">
                        Daily full-sentence goal
                      </label>
                      <p>
                        Short phrases and re-recordings do not count; 0 hides the
                        goal without disabling practice.
                      </p>
                    </div>
                    <input
                      id="daily-listen-repeat-goal"
                      type="number"
                      min={DAILY_LISTEN_REPEAT_GOAL.min}
                      max={DAILY_LISTEN_REPEAT_GOAL.max}
                      step="1"
                      value={settings.dailyListenRepeatGoal}
                      onChange={(event) => previewSetting(
                        "dailyListenRepeatGoal",
                        Number(event.target.value)
                      )}
                    />
                  </div>
                </fieldset>
                </section>
              </section>
            ) : null}
            {activeSettingsSection === "voice" ? (
              <section
                className="settings-panel"
                role="tabpanel"
                id="settings-panel-voice"
                aria-labelledby="settings-tab-voice"
              >
                <div className="settings-section-intro ai-voice-intro">
                  <h3>Build your reading voice</h3>
                </div>
                <section className="ai-voice-key-card">
                  <div className="ai-voice-key-heading">
                    <div>
                      <span className="ai-voice-heading-icon" aria-hidden="true">
                        <KeyRound />
                      </span>
                      <div>
                        <label
                          id="ai-voice-key-label"
                          htmlFor={aiVoiceSettings.hasApiKey && !isReplacingAiVoiceKey
                            ? undefined
                            : "ai-voice-api-key"}
                        >
                          OpenAI API key
                        </label>
                        <span>Used only to generate your selected-text audio.</span>
                      </div>
                    </div>
                    <strong className={`ai-voice-status ${
                      aiVoiceSettings.hasApiKey ? "is-configured" : ""
                    }`}>
                      {aiVoiceSettings.hasApiKey ? <Check aria-hidden="true" /> : null}
                      {aiVoiceSettings.hasApiKey ? "Configured" : "Required"}
                    </strong>
                  </div>
                  {aiVoiceSettings.hasApiKey && !isReplacingAiVoiceKey ? (
                    <div className="ai-voice-key-input ai-voice-saved-key">
                      <LockKeyhole aria-hidden="true" />
                      <span aria-label="Saved API key">
                        <strong>•••• •••• •••• ••••</strong>
                        <small>Saved securely</small>
                      </span>
                      <button
                        type="button"
                        className="ai-voice-replace-key"
                        disabled={isAiVoiceApplying}
                        onClick={() => {
                          setIsReplacingAiVoiceKey(true);
                          setAiVoiceApiKey("");
                          setIsAiVoiceKeyVisible(false);
                        }}
                      >
                        Replace
                      </button>
                    </div>
                  ) : (
                    <div className="ai-voice-key-input">
                      <KeyRound aria-hidden="true" />
                      <input
                        id="ai-voice-api-key"
                        aria-label="OpenAI API key"
                        type={isAiVoiceKeyVisible ? "text" : "password"}
                        autoComplete="off"
                        spellCheck="false"
                        value={aiVoiceApiKey}
                        placeholder={aiVoiceSettings.hasApiKey
                          ? "Paste a new key to replace the saved key"
                          : "Paste your OpenAI API key"}
                        disabled={isAiVoiceApplying}
                        onChange={(event) => setAiVoiceApiKey(event.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={isAiVoiceKeyVisible ? "Hide API key" : "Show API key"}
                        disabled={isAiVoiceApplying || !aiVoiceApiKey}
                        onClick={() => setIsAiVoiceKeyVisible((current) => !current)}
                      >
                        {isAiVoiceKeyVisible
                          ? <EyeOff aria-hidden="true" />
                          : <Eye aria-hidden="true" />}
                      </button>
                    </div>
                  )}
                  <p className="ai-voice-security-note">
                    <LockKeyhole aria-hidden="true" />
                    Encrypted on this device. The original value is never shown or
                    included in backups.
                  </p>
                </section>

                <fieldset className="ai-voice-choice-section">
                  <legend>Choose a voice</legend>
                  <div className="ai-voice-choice-grid">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aiVoiceDraft.voice === "cedar"}
                      aria-label="Cedar voice, clear and steady"
                      className={aiVoiceDraft.voice === "cedar" ? "is-selected" : ""}
                      disabled={isAiVoiceApplying}
                      onClick={() => setAiVoiceDraft((current) => ({
                        ...current,
                        voice: "cedar"
                      }))}
                    >
                      <span className="ai-voice-choice-icon cedar" aria-hidden="true">
                        <Focus />
                      </span>
                      <span><strong>Cedar</strong><small>Clear &amp; steady</small></span>
                      {aiVoiceDraft.voice === "cedar"
                        ? <Check className="ai-voice-choice-check" aria-hidden="true" />
                        : null}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aiVoiceDraft.voice === "marin"}
                      aria-label="Marin voice, warm and natural"
                      className={aiVoiceDraft.voice === "marin" ? "is-selected" : ""}
                      disabled={isAiVoiceApplying}
                      onClick={() => setAiVoiceDraft((current) => ({
                        ...current,
                        voice: "marin"
                      }))}
                    >
                      <span className="ai-voice-choice-icon marin" aria-hidden="true">
                        <Waves />
                      </span>
                      <span><strong>Marin</strong><small>Warm &amp; natural</small></span>
                      {aiVoiceDraft.voice === "marin"
                        ? <Check className="ai-voice-choice-check" aria-hidden="true" />
                        : null}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aiVoiceDraft.voice === "coral"}
                      aria-label="Coral voice, bright and friendly"
                      className={aiVoiceDraft.voice === "coral" ? "is-selected" : ""}
                      disabled={isAiVoiceApplying}
                      onClick={() => setAiVoiceDraft((current) => ({
                        ...current,
                        voice: "coral"
                      }))}
                    >
                      <span className="ai-voice-choice-icon coral" aria-hidden="true">
                        <SunMedium />
                      </span>
                      <span><strong>Coral</strong><small>Bright &amp; friendly</small></span>
                      {aiVoiceDraft.voice === "coral"
                        ? <Check className="ai-voice-choice-check" aria-hidden="true" />
                        : null}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aiVoiceDraft.voice === "onyx"}
                      aria-label="Onyx voice, deep and narrative"
                      className={aiVoiceDraft.voice === "onyx" ? "is-selected" : ""}
                      disabled={isAiVoiceApplying}
                      onClick={() => setAiVoiceDraft((current) => ({
                        ...current,
                        voice: "onyx"
                      }))}
                    >
                      <span className="ai-voice-choice-icon onyx" aria-hidden="true">
                        <MoonStar />
                      </span>
                      <span><strong>Onyx</strong><small>Deep &amp; narrative</small></span>
                      {aiVoiceDraft.voice === "onyx"
                        ? <Check className="ai-voice-choice-check" aria-hidden="true" />
                        : null}
                    </button>
                  </div>
                </fieldset>

                <fieldset className="ai-voice-choice-section ai-voice-tone-section">
                  <legend>Choose a tone</legend>
                  <div className="ai-voice-choice-grid">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aiVoiceDraft.tone === "learning"}
                      aria-label="Learning tone, clear and slightly slower"
                      className={aiVoiceDraft.tone === "learning" ? "is-selected" : ""}
                      disabled={isAiVoiceApplying}
                      onClick={() => setAiVoiceDraft((current) => ({
                        ...current,
                        tone: "learning"
                      }))}
                    >
                      <span className="ai-voice-choice-icon learning" aria-hidden="true">
                        <GraduationCap />
                      </span>
                      <span><strong>Learning</strong><small>Clear &amp; slower</small></span>
                      {aiVoiceDraft.tone === "learning"
                        ? <Check className="ai-voice-choice-check" aria-hidden="true" />
                        : null}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aiVoiceDraft.tone === "natural"}
                      aria-label="Natural tone, everyday reading pace"
                      className={aiVoiceDraft.tone === "natural" ? "is-selected" : ""}
                      disabled={isAiVoiceApplying}
                      onClick={() => setAiVoiceDraft((current) => ({
                        ...current,
                        tone: "natural"
                      }))}
                    >
                      <span className="ai-voice-choice-icon natural" aria-hidden="true">
                        <MessageCircle />
                      </span>
                      <span><strong>Natural</strong><small>Everyday pace</small></span>
                      {aiVoiceDraft.tone === "natural"
                        ? <Check className="ai-voice-choice-check" aria-hidden="true" />
                        : null}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aiVoiceDraft.tone === "calm"}
                      aria-label="Calm tone, gentle with measured pauses"
                      className={aiVoiceDraft.tone === "calm" ? "is-selected" : ""}
                      disabled={isAiVoiceApplying}
                      onClick={() => setAiVoiceDraft((current) => ({
                        ...current,
                        tone: "calm"
                      }))}
                    >
                      <span className="ai-voice-choice-icon calm" aria-hidden="true">
                        <Leaf />
                      </span>
                      <span><strong>Calm</strong><small>Gentle pauses</small></span>
                      {aiVoiceDraft.tone === "calm"
                        ? <Check className="ai-voice-choice-check" aria-hidden="true" />
                        : null}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aiVoiceDraft.tone === "expressive"}
                      aria-label="Expressive tone, restrained storytelling"
                      className={aiVoiceDraft.tone === "expressive" ? "is-selected" : ""}
                      disabled={isAiVoiceApplying}
                      onClick={() => setAiVoiceDraft((current) => ({
                        ...current,
                        tone: "expressive"
                      }))}
                    >
                      <span className="ai-voice-choice-icon expressive" aria-hidden="true">
                        <Drama />
                      </span>
                      <span><strong>Expressive</strong><small>Storytelling</small></span>
                      {aiVoiceDraft.tone === "expressive"
                        ? <Check className="ai-voice-choice-check" aria-hidden="true" />
                        : null}
                    </button>
                  </div>
                </fieldset>

                <div className="ai-voice-apply-panel">
                  <div>
                    <Sparkles aria-hidden="true" />
                    <span>
                      <strong>{aiVoiceDraft.voice} · {aiVoiceDraft.tone}</strong>
                      <small>AI-generated · uses your OpenAI credits</small>
                    </span>
                  </div>
                  <div className="ai-voice-actions">
                    {aiVoiceSettings.hasApiKey ? (
                      <button
                        className="ai-voice-remove-key"
                        type="button"
                        onClick={() => void removeAiVoiceApiKey()}
                        disabled={isAiVoiceApplying}
                      >
                        Remove key
                      </button>
                    ) : null}
                    <button
                      className="ai-voice-apply"
                      type="button"
                      onClick={() => void applyAiVoiceSettings()}
                      disabled={isAiVoiceApplying ||
                        (!aiVoiceSettings.hasApiKey && !aiVoiceApiKey.trim())}
                    >
                      {isAiVoiceApplying ? (
                        <><LoaderCircle aria-hidden="true" /> Applying…</>
                      ) : (
                        <><Volume2 aria-hidden="true" /> Apply and preview</>
                      )}
                    </button>
                  </div>
                </div>
                {aiVoiceMessage ? (
                  <output className="data-backup-message">{aiVoiceMessage}</output>
                ) : null}
                {aiVoiceError ? (
                  <small className="data-backup-error" role="alert">
                    {aiVoiceError}
                  </small>
                ) : null}
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
              All three workspaces, their practice activity, and shared settings
              are replaced. The datasets will not be merged.
            </p>
            <dl className="data-restore-summary">
              {dataRestorePreview.workspaceCounts
                ? (["en", "ja", "zh-TW"] as const).map((language) => (
                    <div key={language}>
                      <dt>{language === "en" ? "English" : language === "ja"
                        ? "Japanese" : "Traditional Chinese"}</dt>
                      <dd>
                        {dataRestorePreview.workspaceCounts?.[language].books} books · {" "}
                        {dataRestorePreview.workspaceCounts?.[language]
                          .activeLearningItems} active · {" "}
                        {dataRestorePreview.workspaceCounts?.[language]
                          .trashedLearningItems} trashed
                      </dd>
                    </div>
                  ))
                : null}
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
              {dataRestorePreview.unclassifiedLearningItems ? (
                <div>
                  <dt>Unclassified</dt>
                  <dd>{dataRestorePreview.unclassifiedLearningItems} learning items</dd>
                </div>
              ) : null}
            </dl>
            <p>
              VocabReader will restart automatically after a successful restore.
              AI conversations and Codex sign-in remain unchanged.
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

      {openLearningItemBatch && desktopChat() && desktopLearning() ? (
        <LearningItemDraftDialog
          batch={openLearningItemBatch}
          api={desktopChat()!}
          learningApi={desktopLearning()!}
          reviewApi={desktopReview()}
          onClose={() => setOpenLearningItemBatchId(undefined)}
          onSnapshot={handleLearningItemSnapshot}
        />
      ) : null}

    </div>
  );
}
