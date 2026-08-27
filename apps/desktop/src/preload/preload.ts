import { contextBridge, ipcRenderer } from "electron";
import type { AppInfoDesktopApi } from "../shared/app-info-contracts";
import type {
  ChatDesktopApi,
  ChatSnapshot,
  SendChatMessageInput
} from "../shared/chat-contracts";
import type {
  DataBackupDesktopApi,
  ExportDataBackupResult,
  SelectDataBackupResult
} from "../shared/data-backup-contracts";
import type {
  ChapterContent,
  ImportBookResult,
  LibraryBook,
  SaveAnnotationsInput,
  SaveReadingRangeInput,
  SaveReadingStateInput
} from "../shared/library-contracts";
import type {
  LearningDesktopApi,
  LearningItemEditSnapshot,
  LearningItem,
  LearningItemCounts,
  LearningItemListInput,
  LearningItemPage,
  UpdateLearningItemDraftInput,
  UpdateLearningItemInput
} from "../shared/learning-contracts";
import type {
  ConfirmReviewPaperInput,
  GenerateReviewPaperInput,
  GradeReviewPaperInput,
  ReviewDesktopApi,
  ReviewGenerationProgress
} from "../shared/review-contracts";
import type {
  GenerateSentencePracticeExamplesInput,
  SentencePracticeDesktopApi,
  StartSentencePracticeInput,
  SubmitSentencePracticeInput
} from "../shared/sentence-practice-contracts";
import type {
  ListenRepeatDesktopApi,
  ProcessListenRepeatInput,
  SaveListenRepeatDraftInput,
  SaveListenRepeatRecordingInput
} from "../shared/listen-repeat-contracts";
import type {
  AppSettings,
  SettingsDesktopApi
} from "../shared/settings-contracts";
import type {
  ApplySelectionSpeechSettingsInput,
  ApplySelectionSpeechSettingsResult,
  SelectionSpeechDesktopApi,
  SelectionSpeechSettingsSnapshot,
  SelectionSpeechStreamEvent
} from "../shared/selection-speech-contracts";

const desktopApi = Object.freeze({
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  }),
  appInfo: Object.freeze({
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke("app-info:get-version")
  } satisfies AppInfoDesktopApi),
  library: Object.freeze({
    listBooks: (): Promise<LibraryBook[]> => ipcRenderer.invoke("library:list"),
    importBook: (): Promise<ImportBookResult> =>
      ipcRenderer.invoke("library:import"),
    deleteBook: (bookId: string): Promise<void> =>
      ipcRenderer.invoke("library:delete", bookId),
    getChapterContent: (
      bookId: string,
      chapterId: string
    ): Promise<ChapterContent> =>
      ipcRenderer.invoke("library:chapter", bookId, chapterId),
    saveReadingState: (input: SaveReadingStateInput): Promise<LibraryBook> =>
      ipcRenderer.invoke("library:save-reading-state", input),
    saveReadingRange: (input: SaveReadingRangeInput): Promise<LibraryBook> =>
      ipcRenderer.invoke("library:save-reading-range", input),
    saveAnnotations: (input: SaveAnnotationsInput): Promise<LibraryBook> =>
      ipcRenderer.invoke("library:save-annotations", input)
  }),
  learning: Object.freeze({
    listItems: (input: LearningItemListInput): Promise<LearningItemPage> =>
      ipcRenderer.invoke("learning:list", input),
    countItems: (): Promise<LearningItemCounts> =>
      ipcRenderer.invoke("learning:counts"),
    getItem: (itemId: string): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:get", itemId),
    updateItem: (input: UpdateLearningItemInput): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:update", input),
    trashItem: (itemId: string): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:trash", itemId),
    restoreItem: (itemId: string): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:restore", itemId),
    emptyTrash: (): Promise<{ deleted: number }> =>
      ipcRenderer.invoke("learning:empty-trash"),
    selectRepresentativeImage: (itemId: string) =>
      ipcRenderer.invoke("learning:select-representative-image", itemId),
    setRepresentativeImageFromUrl: (
      itemId: string,
      imageUrl: string
    ): Promise<LearningItem> => ipcRenderer.invoke(
      "learning:set-representative-image-from-url",
      itemId,
      imageUrl
    ),
    removeRepresentativeImage: (itemId: string): Promise<LearningItem> =>
      ipcRenderer.invoke("learning:remove-representative-image", itemId),
    aiEdit: Object.freeze({
      start: (itemId: string): Promise<LearningItemEditSnapshot> =>
        ipcRenderer.invoke("learning-edit:start", itemId),
      send: (sessionId: string, request: string): Promise<LearningItemEditSnapshot> =>
        ipcRenderer.invoke("learning-edit:send", sessionId, request),
      stop: (sessionId: string): Promise<LearningItemEditSnapshot> =>
        ipcRenderer.invoke("learning-edit:stop", sessionId),
      apply: (sessionId: string): Promise<LearningItem> =>
        ipcRenderer.invoke("learning-edit:apply", sessionId),
      discard: (sessionId: string): Promise<void> =>
        ipcRenderer.invoke("learning-edit:discard", sessionId)
    })
  } satisfies LearningDesktopApi),
  review: Object.freeze({
    getSummary: () => ipcRenderer.invoke("review:summary"),
    generatePaper: (input: GenerateReviewPaperInput) =>
      ipcRenderer.invoke("review:generate", input),
    gradePaper: (input: GradeReviewPaperInput) =>
      ipcRenderer.invoke("review:grade", input),
    confirmPaper: (input: ConfirmReviewPaperInput) =>
      ipcRenderer.invoke("review:confirm", input),
    discardPaper: (): Promise<void> => ipcRenderer.invoke("review:discard"),
    getItemDetail: (itemId: string) =>
      ipcRenderer.invoke("review:item-detail", itemId),
    onGenerationProgress(
      listener: (progress: ReviewGenerationProgress) => void
    ) {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        progress: ReviewGenerationProgress
      ) => listener(progress);
      ipcRenderer.on("review:generation-progress", wrapped);
      return () => ipcRenderer.off("review:generation-progress", wrapped);
    }
  } satisfies ReviewDesktopApi),
  sentencePractice: Object.freeze({
    getSnapshot: () => ipcRenderer.invoke("sentence-practice:snapshot"),
    startSession: (input: StartSentencePracticeInput) =>
      ipcRenderer.invoke("sentence-practice:start", input),
    submit: (input: SubmitSentencePracticeInput) =>
      ipcRenderer.invoke("sentence-practice:submit", input),
    generateExamples: (input: GenerateSentencePracticeExamplesInput) =>
      ipcRenderer.invoke("sentence-practice:examples", input)
  } satisfies SentencePracticeDesktopApi),
  listenRepeat: Object.freeze({
    getSnapshot: () => ipcRenderer.invoke("listen-repeat:snapshot"),
    saveDraft: (input: SaveListenRepeatDraftInput) =>
      ipcRenderer.invoke("listen-repeat:draft", input),
    process: (input: ProcessListenRepeatInput) =>
      ipcRenderer.invoke("listen-repeat:process", input),
    saveRecording: (input: SaveListenRepeatRecordingInput) =>
      ipcRenderer.invoke("listen-repeat:save-recording", input),
    getRecording: (input: { practiceId: string; chunkId: string }) =>
      ipcRenderer.invoke("listen-repeat:recording", input),
    prepareAiAudio: (input: { practiceId: string; chunkId: string }) =>
      ipcRenderer.invoke("listen-repeat:ai-audio", input),
    cancelAiAudio: (input: { practiceId: string; chunkId?: string }) =>
      ipcRenderer.invoke("listen-repeat:cancel-ai-audio", input),
    clear: () => ipcRenderer.invoke("listen-repeat:clear")
  } satisfies ListenRepeatDesktopApi),
  settings: Object.freeze({
    get: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
    save: (settings: AppSettings): Promise<AppSettings> =>
      ipcRenderer.invoke("settings:save", settings),
    getUnclassifiedLearningItemCount: (): Promise<number> =>
      ipcRenderer.invoke("settings:unclassified-count"),
    assignUnclassifiedLearningItems: (
      language: AppSettings["learningLanguage"]
    ): Promise<number> =>
      ipcRenderer.invoke("settings:assign-unclassified", language)
  } satisfies SettingsDesktopApi),
  selectionSpeech: Object.freeze({
    getSettings: (): Promise<SelectionSpeechSettingsSnapshot> =>
      ipcRenderer.invoke("selection-speech:get-settings"),
    applySettings: (
      input: ApplySelectionSpeechSettingsInput
    ): Promise<ApplySelectionSpeechSettingsResult> =>
      ipcRenderer.invoke("selection-speech:apply-settings", input),
    removeApiKey: (): Promise<SelectionSpeechSettingsSnapshot> =>
      ipcRenderer.invoke("selection-speech:remove-api-key"),
    start: (input: { text: string }): Promise<{ requestId: string }> =>
      ipcRenderer.invoke("selection-speech:start", input),
    cancel: (requestId: string): Promise<void> =>
      ipcRenderer.invoke("selection-speech:cancel", requestId),
    onEvent: (listener: (event: SelectionSpeechStreamEvent) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        listener(payload as SelectionSpeechStreamEvent);
      };
      ipcRenderer.on("selection-speech:event", wrapped);
      return () => ipcRenderer.off("selection-speech:event", wrapped);
    }
  } satisfies SelectionSpeechDesktopApi),
  dataBackup: Object.freeze({
    exportBackup: (): Promise<ExportDataBackupResult> =>
      ipcRenderer.invoke("data-backup:export"),
    selectBackup: (): Promise<SelectDataBackupResult> =>
      ipcRenderer.invoke("data-backup:select"),
    cancelRestore: (token: string): Promise<void> =>
      ipcRenderer.invoke("data-backup:cancel-restore", token),
    restoreBackup: (token: string): Promise<void> =>
      ipcRenderer.invoke("data-backup:restore", token)
  } satisfies DataBackupDesktopApi),
  chat: Object.freeze({
    getState: (): Promise<ChatSnapshot> => ipcRenderer.invoke("chat:get-state"),
    connect: (): Promise<ChatSnapshot> => ipcRenderer.invoke("chat:connect"),
    sendMessage: (input: SendChatMessageInput): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:send", input),
    startNewConversation: (): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:new"),
    selectConversation: (conversationId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:select", conversationId),
    removeConversation: (conversationId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:remove", conversationId),
    selectModel: (modelId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:select-model", modelId),
    stopResponse: (): Promise<ChatSnapshot> => ipcRenderer.invoke("chat:stop"),
    retryLearningItemPreparation: (
      messageId: string
    ): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:retry-learning-item-preparation", messageId),
    updateLearningItemDraft: (
      input: UpdateLearningItemDraftInput
    ): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:update-learning-item-draft", input),
    setLearningItemDraftState: (
      batchId: string,
      draftId: string,
      state: "included" | "excluded"
    ): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:set-learning-item-draft-state", {
        batchId,
        draftId,
        state
      }),
    abandonLearningItemBatch: (batchId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:abandon-learning-item-batch", batchId),
    submitLearningItemBatch: (batchId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:submit-learning-item-batch", batchId),
    restoreLearningItemMatch: (
      batchId: string,
      itemId: string
    ): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("chat:restore-learning-item-match", {
        batchId,
        itemId
      }),
    onStateChanged(listener: (snapshot: ChatSnapshot) => void) {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        snapshot: ChatSnapshot
      ) => listener(snapshot);
      ipcRenderer.on("chat:state-changed", wrapped);
      return () => ipcRenderer.off("chat:state-changed", wrapped);
    }
  } satisfies ChatDesktopApi)
});

contextBridge.exposeInMainWorld("readerDesktop", desktopApi);
