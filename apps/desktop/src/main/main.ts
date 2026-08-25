import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import {
  LearningLanguageDataBackupService
} from "./learning-language-data-backup-service";
import { restartAfterDataRestore } from "./data-restore-restart";
import { registerLibraryIpc } from "./library-ipc";
import { LocalBookLibrary } from "./library-service";
import {
  LearningLanguageWorkspaceRegistry,
  createActiveWorkspaceProxy
} from "./learning-language-workspace";
import {
  assignUnclassifiedLearningItems,
  countUnclassifiedLearningItems,
  migrateLegacyLearningItems
} from "./learning-language-migration";
import { registerLearningLibraryIpc } from "./learning-library-ipc";
import { LearningItemRepresentativeImageService } from "./learning-item-representative-image";
import { LearningItemEditController } from "./learning-item-edit-controller";
import { registerLearningItemEditIpc } from "./learning-item-edit-ipc";
import { LocalLearningLibrary } from "./learning-library-service";
import { ListenRepeatController } from "./listen-repeat-controller";
import { registerListenRepeatIpc } from "./listen-repeat-ipc";
import { LocalListenRepeatStore } from "./listen-repeat-store";
import { LocalListenRepeatProgressStore } from "./listen-repeat-progress-store";
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
import { configureDevelopmentUserDataPath } from "./user-data-path";
import {
  type LearningLanguage
} from "../shared/settings-contracts";

configureDevelopmentUserDataPath(app);

let chatControllersForShutdown: ChatController[] = [];
let unsubscribeChatState: (() => void) | undefined;
let learningLibrariesForShutdown: LocalLearningLibrary[] = [];
let learningItemEditController: LearningItemEditController | undefined;
let listenRepeatVoicesForShutdown: ListenRepeatVoiceService[] = [];
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

function workspaceRecord<T>(
  create: (language: LearningLanguage) => T
): Record<LearningLanguage, T> {
  return {
    en: create("en"),
    ja: create("ja"),
    "zh-TW": create("zh-TW")
  };
}

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(vocabReaderIconPath);
  }

  const dataRoot = process.env.NODE_ENV === "test"
    ? join(app.getPath("temp"), `vocabreader-workspaces-test-${process.pid}`)
    : app.getPath("userData");
  const workspacePath = (language: LearningLanguage, ...parts: string[]) =>
    language === "en"
      ? join(dataRoot, ...parts)
      : join(dataRoot, "learning-language-workspaces", language, ...parts);
  const settingsPath = join(dataRoot, "settings");
  const settingsStore = new LocalSettingsStore(settingsPath);
  const initialSettings = await settingsStore.load();
  const learningDatabasePath = (language: LearningLanguage) =>
    workspacePath(language, "learning-library", "learning-items.sqlite");
  const unclassifiedLearningDatabasePath = join(
    dataRoot,
    "unassigned-learning-items",
    "learning-items.sqlite"
  );
  migrateLegacyLearningItems({
    en: learningDatabasePath("en"),
    ja: learningDatabasePath("ja"),
    "zh-TW": learningDatabasePath("zh-TW"),
    other: unclassifiedLearningDatabasePath,
    snapshot: join(
      dataRoot,
      "migrations",
      "F69-legacy-learning-items.sqlite"
    ),
    marker: join(dataRoot, "migrations", "F69-complete.json")
  });

  const bookLibraries = workspaceRecord((language) =>
    new LocalBookLibrary(workspacePath(language, "library"))
  );
  const bookLibraryRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    bookLibraries
  );
  const bookLibrary = createActiveWorkspaceProxy(bookLibraryRegistry);
  registerLibraryIpc(ipcMain, dialog, bookLibrary);

  const reviewPreferences = async () => {
    const current = await settingsStore.load();
    return {
      dailyNewItemCompletionLimit: current.dailyNewItemCompletionLimit,
      dailyDueReviewCompletionLimit: current.dailyDueReviewCompletionLimit,
      reviewPaperSize: current.reviewPaperSize
    };
  };
  const learningLibraries = workspaceRecord((language) =>
    new LocalLearningLibrary(
      learningDatabasePath(language),
      {
        getReviewPreferences: reviewPreferences,
        workspaceLanguage: language,
        seedMockItems: language === "en"
      }
    )
  );
  learningLibrariesForShutdown = Object.values(learningLibraries);
  const learningLibraryRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    learningLibraries
  );
  const learningLibrary = createActiveWorkspaceProxy(
    learningLibraryRegistry
  ) as LocalLearningLibrary;

  const progressDirectory = (language: LearningLanguage) =>
    language === "en" ? settingsPath : workspacePath(language, "progress");
  const sentenceProgressStores = workspaceRecord((language) =>
    new LocalSentencePracticeProgressStore(progressDirectory(language))
  );
  const sentenceProgressRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    sentenceProgressStores
  );
  const listenProgressStores = workspaceRecord((language) =>
    new LocalListenRepeatProgressStore(progressDirectory(language))
  );
  const listenProgressRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    listenProgressStores
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
  const learningItemRepresentativeImages = new LearningItemRepresentativeImageService(
    dialog,
    learningLibrary
  );
  registerLearningLibraryIpc(
    ipcMain,
    learningLibrary,
    learningItemRepresentativeImages
  );
  const dataBackupTemporaryRoot = process.env.NODE_ENV === "test"
    ? join(app.getPath("temp"), `vocabreader-data-backup-test-${process.pid}`)
    : join(app.getPath("userData"), ".data-backup-staging");
  const workspaceBackupServices = workspaceRecord((language) =>
    new DataBackupService({
      libraryPath: workspacePath(language, "library"),
      learningDatabasePath: learningDatabasePath(language),
      temporaryRoot: join(dataBackupTemporaryRoot, language),
      appVersion: app.getVersion(),
      waitForBookWrites: () => bookLibraries[language].waitForIdle(),
      snapshotBookIndex: () => bookLibraries[language].listBooks(),
      snapshotLearningDatabase: (destinationPath) =>
        learningLibraries[language].backupTo(destinationPath),
      sentencePracticeProgressPath: join(
        progressDirectory(language),
        "sentence-practice-progress.json"
      ),
      snapshotSentencePracticeProgress: () =>
        sentenceProgressStores[language].snapshotBytes(),
      listenRepeatProgressPath: join(
        progressDirectory(language),
        "listen-repeat-progress.json"
      ),
      snapshotListenRepeatProgress: () =>
        listenProgressStores[language].snapshotBytes(),
      closeLearningDatabase: () => learningLibrariesForShutdown.forEach(
        (library) => library.close()
      ),
      relaunch: () => undefined
    })
  );
  const relaunchAfterRestore = () => {
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
  };
  const dataBackupService = new LearningLanguageDataBackupService({
    workspaces: workspaceBackupServices,
    temporaryRoot: dataBackupTemporaryRoot,
    appVersion: app.getVersion(),
    loadSettings: () => settingsStore.load(),
    saveSettings: (settings) => settingsStore.save(settings),
    snapshotUnclassified: async () => {
      try {
        return await readFile(unclassifiedLearningDatabasePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    inspectUnclassified: async (bytes) => {
      const path = join(
        dataBackupTemporaryRoot,
        `unclassified-${process.pid}.sqlite`
      );
      await mkdir(dataBackupTemporaryRoot, { recursive: true });
      await writeFile(path, bytes);
      try {
        return countUnclassifiedLearningItems(path);
      } finally {
        await rm(path, { force: true });
      }
    },
    restoreUnclassified: async (bytes) => {
      await mkdir(dirname(unclassifiedLearningDatabasePath), {
        recursive: true
      });
      if (bytes) await writeFile(unclassifiedLearningDatabasePath, bytes);
      else await rm(unclassifiedLearningDatabasePath, { force: true });
    },
    relaunch: relaunchAfterRestore
  });
  registerDataBackupIpc(
    ipcMain,
    dialog,
    dataBackupService,
    defaultDataBackupFileName()
  );
  registerSelectionSpeechIpc(ipcMain, selectionSpeechService);
  const runtimePath = join(app.getPath("userData"), "codex-runtime");
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
  const reviewControllers = workspaceRecord((language) =>
    new SpacedReviewController({
      createClient: () => new SpawnedCodexAppServerClient(),
      workingDirectory: runtimePath,
      skillPath: spacedReviewSkill.path,
      skillInstructions: spacedReviewSkillMarkdown,
      library: learningLibraries[language]
    })
  );
  const reviewControllerRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    reviewControllers
  );
  registerSpacedReviewIpc(
    ipcMain,
    createActiveWorkspaceProxy(reviewControllerRegistry) as SpacedReviewController
  );

  const sentenceControllers = workspaceRecord((language) =>
    new SentencePracticeController({
      createClient: () => new SpawnedCodexAppServerClient(),
      workingDirectory: runtimePath,
      skillPath: sentencePracticeSkill.path,
      skillInstructions: sentencePracticeSkillMarkdown,
      library: learningLibraries[language],
      progress: sentenceProgressStores[language],
      learningLanguage: language
    })
  );
  const sentenceControllerRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    sentenceControllers
  );
  registerSentencePracticeIpc(
    ipcMain,
    createActiveWorkspaceProxy(sentenceControllerRegistry) as SentencePracticeController
  );

  const listenRepeatDirectory = (language: LearningLanguage) =>
    process.env.NODE_ENV === "test" && language === "en"
      ? join(
          app.getPath("temp"),
          `vocabreader-listen-repeat-test-${process.pid}`
        )
      : workspacePath(language, "listen-and-repeat");
  const listenRepeatStores = workspaceRecord((language) =>
    new LocalListenRepeatStore(listenRepeatDirectory(language))
  );
  const listenStoreRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    listenRepeatStores
  );
  const listenRepeatVoices = workspaceRecord((language) =>
    new ListenRepeatVoiceService({
      store: listenRepeatStores[language],
      settingsStore,
      apiKeyStore: selectionSpeechApiKeyStore
    })
  );
  listenRepeatVoicesForShutdown = Object.values(listenRepeatVoices);
  const listenControllers = workspaceRecord((language) =>
    new ListenRepeatController({
      createClient: () => new SpawnedCodexAppServerClient(),
      workingDirectory: runtimePath,
      skillPath: listenRepeatSkill.path,
      skillInstructions: listenRepeatSkillMarkdown,
      store: listenRepeatStores[language],
      progress: listenProgressStores[language],
      voice: listenRepeatVoices[language]
    })
  );
  const listenControllerRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    listenControllers
  );
  registerListenRepeatIpc(
    ipcMain,
    createActiveWorkspaceProxy(listenControllerRegistry) as ListenRepeatController
  );

  const createChatController = (language: LearningLanguage) => new ChatController({
    createClient: () => new SpawnedCodexAppServerClient(),
    learningLanguage: language,
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
      learningLibraries[language].findDuplicateCandidates(titles),
    createLearningItemsAtomically: (inputs) =>
      learningLibraries[language].createItemsAtomically(inputs),
    restoreLearningItem: (itemId) => learningLibraries[language].restoreItem(itemId),
    classifyLearningItemDuplicates: (drafts, candidates) =>
      classifyLearningItemDuplicatesWithCodex({
        createClient: () => new SpawnedCodexAppServerClient(),
        workingDirectory: runtimePath,
        skillPath: learningItemCreationSkill.path,
        skillInstructions: learningItemCreationSkillMarkdown,
        drafts,
        candidates
    }),
    conversationStore: new LocalChatConversationStore(
      workspacePath(language, "chat")
    )
  });
  const chatControllers = workspaceRecord(createChatController);
  chatControllersForShutdown = Object.values(chatControllers);
  const chatControllerRegistry = new LearningLanguageWorkspaceRegistry(
    initialSettings.learningLanguage,
    chatControllers
  );
  const activeChatProxy = createActiveWorkspaceProxy(chatControllerRegistry);
  const observableChatProxy = new Proxy(activeChatProxy, {
    get(target, property, receiver) {
      if (property === "onStateChanged") {
        return (listener: (snapshot: ReturnType<ChatController["getSnapshot"]>) => void) => {
          const unsubscribers = chatControllerRegistry.all().map(([, controller]) =>
            controller.onStateChanged((snapshot) => {
              if (chatControllerRegistry.active === controller) listener(snapshot);
            })
          );
          return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
      }
      return Reflect.get(target, property, receiver);
    }
  }) as ChatController;
  unsubscribeChatState = registerChatIpc(
    ipcMain,
    observableChatProxy,
    (snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("chat:state-changed", snapshot);
      }
    }
  );

  registerSettingsIpc(ipcMain, settingsStore, async (language) => {
    if (bookLibraryRegistry.language === language) return;
    chatControllerRegistry.active.close();
    learningItemEditController?.close();
    bookLibraryRegistry.switchTo(language);
    learningLibraryRegistry.switchTo(language);
    sentenceProgressRegistry.switchTo(language);
    listenProgressRegistry.switchTo(language);
    listenStoreRegistry.switchTo(language);
    reviewControllerRegistry.switchTo(language);
    sentenceControllerRegistry.switchTo(language);
    listenControllerRegistry.switchTo(language);
    chatControllerRegistry.switchTo(language);
    await chatControllerRegistry.active.connect();
  }, {
    count: () => countUnclassifiedLearningItems(
      unclassifiedLearningDatabasePath
    ),
    assign: (language) => assignUnclassifiedLearningItems(
      unclassifiedLearningDatabasePath,
      learningDatabasePath(language),
      language
    )
  });
  createMainWindow();
  void chatControllerRegistry.active.connect();

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
  chatControllersForShutdown.forEach((controller) => controller.close());
  chatControllersForShutdown = [];
  learningItemEditController?.close();
  learningItemEditController = undefined;
  learningLibrariesForShutdown.forEach((library) => library.close());
  learningLibrariesForShutdown = [];
  listenRepeatVoicesForShutdown.forEach((voice) => voice.dispose());
  listenRepeatVoicesForShutdown = [];
});
