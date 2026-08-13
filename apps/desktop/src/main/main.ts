import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import vocabReaderIconAsset from "../../assets/icon/vocabreader-language-learning-v6.png";
import annotationExplanationSkillMarkdown from "../../../../.agents/skills/explain-reader-annotations/SKILL.md";
import learningItemCreationSkillMarkdown from "../../../../.agents/skills/create-learning-items/SKILL.md";
import learningItemEditSkillMarkdown from "../../../../.agents/skills/edit-learning-item/SKILL.md";
import readingComprehensionSkillMarkdown from "../../../../.agents/skills/practice-reading-comprehension/SKILL.md";
import segmentRetellingSkillMarkdown from "../../../../.agents/skills/practice-segment-retelling/SKILL.md";
import spacedReviewSkillMarkdown from "../../../../.agents/skills/practice-spaced-review/SKILL.md";
import sentencePracticeSkillMarkdown from "../../../../.agents/skills/practice-integrated-sentences/SKILL.md";
import listenRepeatSkillMarkdown from "../../../../.agents/skills/prepare-listen-and-repeat-practice/SKILL.md";
import {
  installBundledAnnotationSkill,
  installBundledLearningItemCreationSkill,
  installBundledLearningItemEditSkill,
  installBundledReadingComprehensionSkill,
  installBundledSegmentRetellingSkill,
  installBundledSentencePracticeSkill,
  installBundledListenRepeatSkill,
  installBundledSpacedReviewSkill
} from "./bundled-skill";
import { ChatController } from "./chat-controller";
import { LocalChatConversationStore } from "./chat-conversation-store";
import { registerChatIpc } from "./chat-ipc";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import { registerDataBackupIpc } from "./data-backup-ipc";
import {
  DataBackupService,
  defaultDataBackupFileName
} from "./data-backup-service";
import { restartAfterDataRestore } from "./data-restore-restart";
import { registerLibraryIpc } from "./library-ipc";
import { LocalBookLibrary } from "./library-service";
import { registerLearningLibraryIpc } from "./learning-library-ipc";
import { LearningItemRepresentativeImageService } from "./learning-item-representative-image";
import { LearningItemEditController } from "./learning-item-edit-controller";
import { registerLearningItemEditIpc } from "./learning-item-edit-ipc";
import { LocalLearningLibrary } from "./learning-library-service";
import { ListenRepeatController } from "./listen-repeat-controller";
import { registerListenRepeatIpc } from "./listen-repeat-ipc";
import { LocalListenRepeatStore } from "./listen-repeat-store";
import { ListenRepeatVoiceService } from "./listen-repeat-voice-service";
import { classifyLearningItemDuplicatesWithCodex } from "./learning-item-duplicate-classifier";
import { registerSettingsIpc } from "./settings-ipc";
import { SentencePracticeController } from "./sentence-practice-controller";
import { registerSentencePracticeIpc } from "./sentence-practice-ipc";
import {
  LocalSentencePracticeProgressStore
} from "./sentence-practice-progress-store";
import { LocalSettingsStore } from "./settings-store";
import { registerSelectionSpeechIpc } from "./selection-speech-ipc";
import {
  EncryptedSelectionSpeechApiKeyStore,
  SelectionSpeechService
} from "./selection-speech-service";
import { SpacedReviewController } from "./spaced-review-controller";
import { registerSpacedReviewIpc } from "./spaced-review-ipc";

let chatController: ChatController | undefined;
let unsubscribeChatState: (() => void) | undefined;
let learningLibraryForShutdown: LocalLearningLibrary | undefined;
let learningItemEditController: LearningItemEditController | undefined;
const vocabReaderIconPath = join(__dirname, vocabReaderIconAsset);

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "VocabReader",
    icon: vocabReaderIconPath,
    backgroundColor: "#f5f1e8",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../dist/renderer/index.html"));
  }

  return window;
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(vocabReaderIconPath);
  }

  const libraryPath =
    process.env.NODE_ENV === "test"
      ? join(app.getPath("temp"), `vocabreader-library-test-${process.pid}`)
      : join(app.getPath("userData"), "library");
  const bookLibrary = new LocalBookLibrary(libraryPath);
  registerLibraryIpc(ipcMain, dialog, bookLibrary);
  const learningLibraryPath = process.env.NODE_ENV === "test"
    ? join(app.getPath("temp"), `vocabreader-learning-test-${process.pid}`, "learning-items.sqlite")
    : join(app.getPath("userData"), "learning-library", "learning-items.sqlite");
  const settingsPath = process.env.NODE_ENV === "test"
    ? join(app.getPath("temp"), `vocabreader-settings-test-${process.pid}`)
    : join(app.getPath("userData"), "settings");
  const settingsStore = new LocalSettingsStore(settingsPath);
  const sentencePracticeProgressStore = new LocalSentencePracticeProgressStore(
    settingsPath
  );
  const selectionSpeechApiKeyStore = new EncryptedSelectionSpeechApiKeyStore(
    settingsPath,
    safeStorage
  );
  const selectionSpeechService = new SelectionSpeechService({
    settingsStore,
    apiKeyStore: selectionSpeechApiKeyStore
  });
  app.once("before-quit", () => selectionSpeechService.dispose());
  const learningLibrary = new LocalLearningLibrary(learningLibraryPath, {
    getReviewPreferences: async () => {
      const current = await settingsStore.load();
      return {
        dailyNewItemCompletionLimit: current.dailyNewItemCompletionLimit,
        dailyDueReviewCompletionLimit: current.dailyDueReviewCompletionLimit,
        reviewPaperSize: current.reviewPaperSize
      };
    }
  });
  learningLibraryForShutdown = learningLibrary;
  const learningItemRepresentativeImages = new LearningItemRepresentativeImageService(
    dialog,
    learningLibrary
  );
  registerLearningLibraryIpc(
    ipcMain,
    learningLibrary,
    learningItemRepresentativeImages
  );
  const dataBackupService = new DataBackupService({
    libraryPath,
    learningDatabasePath: learningLibraryPath,
    temporaryRoot: process.env.NODE_ENV === "test"
      ? join(app.getPath("temp"), `vocabreader-data-backup-test-${process.pid}`)
      : join(app.getPath("userData"), ".data-backup-staging"),
    appVersion: app.getVersion(),
    waitForBookWrites: () => bookLibrary.waitForIdle(),
    snapshotBookIndex: () => bookLibrary.listBooks(),
    snapshotLearningDatabase: (destinationPath) =>
      learningLibrary.backupTo(destinationPath),
    sentencePracticeProgressPath: join(
      settingsPath,
      "sentence-practice-progress.json"
    ),
    snapshotSentencePracticeProgress: () =>
      sentencePracticeProgressStore.snapshotBytes(),
    closeLearningDatabase: () => learningLibrary.close(),
    relaunch: () => {
      restartAfterDataRestore({
        developmentServerUrl: process.env.VITE_DEV_SERVER_URL,
        reloadWindows: () => {
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.reloadIgnoringCache();
          }
        },
        relaunch: () => app.relaunch(),
        exit: () => app.exit(0),
        defer: (callback) => setImmediate(callback)
      });
    }
  });
  registerDataBackupIpc(
    ipcMain,
    dialog,
    dataBackupService,
    defaultDataBackupFileName()
  );
  registerSettingsIpc(ipcMain, settingsStore);
  registerSelectionSpeechIpc(ipcMain, selectionSpeechService);
  const runtimePath = join(app.getPath("userData"), "codex-runtime");
  const conversationPath = process.env.NODE_ENV === "test"
    ? join(app.getPath("temp"), `vocabreader-chat-test-${process.pid}`)
    : join(app.getPath("userData"), "chat");
  mkdirSync(runtimePath, { recursive: true });
  const annotationExplanationSkill = installBundledAnnotationSkill(
    runtimePath,
    annotationExplanationSkillMarkdown
  );
  const readingComprehensionSkill = installBundledReadingComprehensionSkill(
    runtimePath,
    readingComprehensionSkillMarkdown
  );
  const segmentRetellingSkill = installBundledSegmentRetellingSkill(
    runtimePath,
    segmentRetellingSkillMarkdown
  );
  const learningItemCreationSkill = installBundledLearningItemCreationSkill(
    runtimePath,
    learningItemCreationSkillMarkdown
  );
  const learningItemEditSkill = installBundledLearningItemEditSkill(
    runtimePath,
    learningItemEditSkillMarkdown
  );
  const spacedReviewSkill = installBundledSpacedReviewSkill(
    runtimePath,
    spacedReviewSkillMarkdown
  );
  const sentencePracticeSkill = installBundledSentencePracticeSkill(
    runtimePath,
    sentencePracticeSkillMarkdown
  );
  const listenRepeatSkill = installBundledListenRepeatSkill(
    runtimePath,
    listenRepeatSkillMarkdown
  );
  learningItemEditController = new LearningItemEditController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: runtimePath,
    skillPath: learningItemEditSkill.path,
    skillInstructions: learningItemEditSkillMarkdown,
    library: learningLibrary
  });
  registerLearningItemEditIpc(ipcMain, learningItemEditController);
  registerSpacedReviewIpc(ipcMain, new SpacedReviewController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: runtimePath,
    skillPath: spacedReviewSkill.path,
    skillInstructions: spacedReviewSkillMarkdown,
    library: learningLibrary
  }));
  registerSentencePracticeIpc(ipcMain, new SentencePracticeController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: runtimePath,
    skillPath: sentencePracticeSkill.path,
    skillInstructions: sentencePracticeSkillMarkdown,
    library: learningLibrary,
    progress: sentencePracticeProgressStore
  }));
  const listenRepeatPath = process.env.NODE_ENV === "test"
    ? join(app.getPath("temp"), `vocabreader-listen-repeat-test-${process.pid}`)
    : join(app.getPath("userData"), "listen-and-repeat");
  const listenRepeatStore = new LocalListenRepeatStore(listenRepeatPath);
  const listenRepeatVoice = new ListenRepeatVoiceService({
    store: listenRepeatStore,
    settingsStore,
    apiKeyStore: selectionSpeechApiKeyStore
  });
  app.once("before-quit", () => listenRepeatVoice.dispose());
  registerListenRepeatIpc(ipcMain, new ListenRepeatController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: runtimePath,
    skillPath: listenRepeatSkill.path,
    skillInstructions: listenRepeatSkillMarkdown,
    store: listenRepeatStore,
    voice: listenRepeatVoice
  }));
  chatController = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: runtimePath,
    annotationExplanationSkillPath: annotationExplanationSkill.path,
    annotationExplanationSkillInstructions: annotationExplanationSkillMarkdown,
    readingComprehensionSkillPath: readingComprehensionSkill.path,
    readingComprehensionSkillInstructions: readingComprehensionSkillMarkdown,
    segmentRetellingSkillPath: segmentRetellingSkill.path,
    segmentRetellingSkillInstructions: segmentRetellingSkillMarkdown,
    learningItemCreationSkillPath: learningItemCreationSkill.path,
    learningItemCreationSkillInstructions: learningItemCreationSkillMarkdown,
    findLearningItemCandidates: (titles) =>
      learningLibrary.findDuplicateCandidates(titles),
    createLearningItemsAtomically: (inputs) =>
      learningLibrary.createItemsAtomically(inputs),
    restoreLearningItem: (itemId) => learningLibrary.restoreItem(itemId),
    classifyLearningItemDuplicates: (drafts, candidates) =>
      classifyLearningItemDuplicatesWithCodex({
        createClient: () => new SpawnedCodexAppServerClient(),
        workingDirectory: runtimePath,
        skillPath: learningItemCreationSkill.path,
        skillInstructions: learningItemCreationSkillMarkdown,
        drafts,
        candidates
      }),
    conversationStore: new LocalChatConversationStore(conversationPath)
  });
  unsubscribeChatState = registerChatIpc(
    ipcMain,
    chatController,
    (snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("chat:state-changed", snapshot);
      }
    }
  );
  createMainWindow();
  void chatController.connect();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  unsubscribeChatState?.();
  unsubscribeChatState = undefined;
  chatController?.close();
  chatController = undefined;
  learningItemEditController?.close();
  learningItemEditController = undefined;
  learningLibraryForShutdown?.close();
  learningLibraryForShutdown = undefined;
});
