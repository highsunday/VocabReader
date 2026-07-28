import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatDesktopApi, ChatSnapshot } from "../shared/chat-contracts";
import type { LibraryBook } from "../shared/library-contracts";
import type {
  LearningDesktopApi,
  LearningItem,
  LearningItemDraftBatch
} from "../shared/learning-contracts";
import type {
  ReviewDesktopApi,
  ReviewPaper
} from "../shared/review-contracts";
import { App } from "./App";

const books: LibraryBook[] = [
  {
    id: "book-one",
    title: "The First Book",
    author: "A. Writer",
    coverDataUrl: null,
    progressPercent: 30,
    lastChapterId: "one-2",
    readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
    chapters: [
      { id: "one-1", title: "Opening", order: 0, href: "one.xhtml", depth: 0, fragment: null },
      { id: "one-2", title: "A New Road", order: 1, href: "two.xhtml", depth: 0, fragment: null }
    ]
  },
  {
    id: "book-two",
    title: "The Second Book",
    author: "B. Writer",
    coverDataUrl: null,
    progressPercent: 0,
    lastChapterId: null,
    readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
    chapters: [{ id: "two-1", title: "Beginnings", order: 0, href: "begin.xhtml", depth: 0, fragment: null }]
  }
];

const learningItems: LearningItem[] = [{
  id: "learning-1",
  title: "reluctant",
  itemType: "word",
  cefr: "B2",
  sense: "unwilling or hesitant",
  markdownContent: "## Meaning\n不情願。",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  trashedAt: null
}];

function installLibraryApi(
  storedBooks: LibraryBook[] = books,
  chat?: Partial<ChatDesktopApi>
) {
  const importBook = vi.fn();
  const deleteBook = vi.fn().mockResolvedValue(undefined);
  const getChapterContent = vi.fn((bookId: string, chapterId: string) => {
    const chapter = storedBooks
      .find((book) => book.id === bookId)
      ?.chapters.find((candidate) => candidate.id === chapterId);
    return Promise.resolve({
      bookId,
      chapterId,
      title: chapter?.title ?? "Chapter",
      fragment: chapter?.fragment ?? null,
      contentHtml: `<p>Content for ${chapterId}</p>${
        chapter?.fragment ? `<h2 id="${chapter.fragment}">Section target</h2>` : ""
      }`
    });
  });
  const saveReadingState = vi.fn((state) =>
    Promise.resolve({
      ...storedBooks.find((book) => book.id === state.bookId),
      readingState: {
        view: state.view,
        chapterId: state.chapterId,
        scrollProgress: state.scrollProgress
      }
    })
  );
  const saveReadingRange = vi.fn((input) =>
    Promise.resolve({
      ...storedBooks.find((book) => book.id === input.bookId),
      chapterRanges: {
        ...storedBooks.find((book) => book.id === input.bookId)?.chapterRanges,
        [input.chapterId]: input.range
      }
    })
  );
  const saveAnnotations = vi.fn((input) =>
    Promise.resolve({
      ...storedBooks.find((book) => book.id === input.bookId),
      chapterAnnotations: {
        ...storedBooks.find((book) => book.id === input.bookId)?.chapterAnnotations,
        [input.chapterId]: input.annotations
      }
    })
  );
  const getSettings = vi.fn().mockResolvedValue({
    explanationLanguage: "source",
    aiConversationFontSize: 13,
    ebookContentFontSize: 19,
    readingPaperWidth: 760,
    ebookLineHeight: 1.9,
    dailyNewItemCompletionLimit: 10,
    dailyDueReviewCompletionLimit: 50,
    reviewPaperSize: 10
  });
  const saveSettings = vi.fn((settings) => Promise.resolve(settings));
  const learning = {
    listItems: vi.fn(async (input) =>
      input.status === "active" ? learningItems : []
    ),
    getItem: vi.fn(async () => learningItems[0]),
    updateItem: vi.fn(async (input) => ({ ...learningItems[0], ...input })),
    trashItem: vi.fn(async () => ({ ...learningItems[0], status: "trashed" as const })),
    restoreItem: vi.fn(async () => learningItems[0]),
    emptyTrash: vi.fn(async () => ({ deleted: 0 }))
  } satisfies LearningDesktopApi;
  const review = {
    getSummary: vi.fn(async () => ({
      dueReviewedCount: 0,
      newCount: 1,
      reviewedNewTodayCount: 0,
      reviewedDueTodayCount: 0,
      newLearningCount: 0,
      dueLearningCount: 0,
      newCompletionLimit: 10,
      dueReviewCompletionLimit: 50,
      reviewPaperSize: 10,
      newRemainingCapacity: 10,
      dueRemainingCapacity: 50,
      backlogTotal: 1,
      totalAvailable: 1,
      selectedItems: [{
        ...learningItems[0],
        reviewKind: "new" as const,
        dueAt: null
      }],
      nextDueAt: null
    })),
    generatePaper: vi.fn(),
    gradePaper: vi.fn(),
    confirmPaper: vi.fn(),
    discardPaper: vi.fn(async () => undefined),
    getItemDetail: vi.fn(async () => ({
      status: "new" as const,
      lastReviewedAt: null,
      lastFinalRating: null,
      nextDueAt: null,
      reviewCount: 0,
      history: []
    })),
    onGenerationProgress: vi.fn(() => () => undefined)
  } satisfies ReviewDesktopApi;
  Object.defineProperty(window, "readerDesktop", {
    configurable: true,
    value: {
      platform: "darwin",
      versions: { chrome: "1", electron: "1", node: "1" },
      library: {
        listBooks: vi.fn().mockResolvedValue(storedBooks),
        importBook,
        deleteBook,
        getChapterContent,
        saveReadingState,
        saveReadingRange,
        saveAnnotations
      },
      learning,
      review,
      settings: { get: getSettings, save: saveSettings },
      ...(chat ? { chat } : {})
    }
  });
  return {
    importBook,
    deleteBook,
    getChapterContent,
    saveReadingState,
    saveReadingRange,
    saveAnnotations,
    getSettings,
    saveSettings,
    learning,
    review
  };
}

function selectText(element: HTMLElement, selectedText: string) {
  const fullText = element.textContent ?? "";
  const selectionStart = fullText.indexOf(selectedText);
  if (selectionStart < 0) throw new Error(`Unable to select: ${selectedText}`);
  const selectionEnd = selectionStart + selectedText.length;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    nodes.push({ node, start: offset, end: offset + node.data.length });
    offset += node.data.length;
    node = walker.nextNode() as Text | null;
  }
  const startTarget = nodes.find((candidate) =>
    selectionStart >= candidate.start && selectionStart < candidate.end
  );
  const endTarget = nodes.find((candidate) =>
    selectionEnd > candidate.start && selectionEnd <= candidate.end
  );
  if (!startTarget || !endTarget) {
    throw new Error(`Unable to map selection: ${selectedText}`);
  }
  const range = document.createRange();
  range.setStart(startTarget.node, selectionStart - startTarget.start);
  range.setEnd(endTarget.node, selectionEnd - endTarget.start);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

afterEach(() => {
  Object.defineProperty(window, "readerDesktop", {
    configurable: true,
    value: undefined
  });
});

function initialReadySnapshot(): ChatSnapshot {
  return {
    connection: "ready",
    connectionDetail: "Codex 已連線。",
    account: { type: "plus", email: "reader@example.com" },
    allowance: {
      phase: "available",
      fiveHour: null,
      weekly: null,
      detail: "已取得帳戶共用額度。"
    },
    messages: [],
    threadId: null,
    activeTurnId: null,
    conversations: [],
    activeConversationId: null,
    managementBusy: false
  };
}

describe("App", () => {
  it("shows the Codex account email in settings without exposing it in the sidebar", async () => {
    const snapshot = {
      connection: "ready" as const,
      connectionDetail: "Codex 已連線。",
      account: { type: "plus", email: "reader@example.com" },
      allowance: {
        phase: "available" as const,
        fiveHour: { remainingPercent: 76, resetsAt: 1_800_000_000 },
        weekly: { remainingPercent: 62, resetsAt: 1_800_100_000 },
        detail: "已取得帳戶共用額度。"
      },
      messages: [],
      threadId: null,
      activeTurnId: null,
      conversations: [],
      activeConversationId: null,
      managementBusy: false,
      models: [
        { id: "gpt-default", displayName: "GPT Default", defaultReasoningEffort: "medium" },
        { id: "gpt-reader", displayName: "GPT Reader", defaultReasoningEffort: "high" }
      ],
      selectedModelId: "gpt-default",
      modelCatalogDetail: "已取得可用對話模型。"
    };
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    const selectModel = vi.fn().mockResolvedValue({
      ...snapshot,
      selectedModelId: "gpt-reader"
    });
    Object.defineProperty(window, "readerDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        versions: { chrome: "1", electron: "1", node: "1" },
        chat: {
          getState: vi.fn().mockResolvedValue(snapshot),
          connect: vi.fn().mockResolvedValue(snapshot),
          sendMessage,
          selectModel,
          stopResponse: vi.fn(),
          onStateChanged: vi.fn().mockReturnValue(() => undefined)
        }
      }
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: "設定" }))
      .toBeInTheDocument();
    expect(screen.getByText("Codex", { selector: ".codex-account-name" }))
      .toBeInTheDocument();
    expect(screen.getByText("已連線", { selector: ".codex-connection-label" }))
      .toBeInTheDocument();
    expect(screen.queryByText("reader@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/已連線：/)).not.toBeInTheDocument();
    expect(screen.queryByText("plus", {
      selector: ".codex-account-type"
    })).not.toBeInTheDocument();
    expect(screen.getByText("76%", { selector: ".allowance-value" }))
      .toBeInTheDocument();
    expect(screen.getByText("62%", { selector: ".allowance-value" }))
      .toBeInTheDocument();
    expect(document.querySelector(".allowance-summary")).toBeInTheDocument();
    expect(document.querySelectorAll(".allowance-summary-row")).toHaveLength(2);
    expect(document.querySelector(".allowance-track")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    expect(screen.getByRole("dialog", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByText("Codex 帳戶")).toBeInTheDocument();
    expect(screen.getByText("reader@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "關閉設定" }));

    expect(screen.getByLabelText("AI 模型")).toHaveValue("gpt-default");
    fireEvent.change(screen.getByLabelText("AI 模型"), {
      target: { value: "gpt-reader" }
    });
    await waitFor(() => expect(selectModel).toHaveBeenCalledWith("gpt-reader"));

    const input = screen.getByLabelText("詢問目前內容");
    expect(input).toHaveAttribute("placeholder", "輸入你的疑問");
    expect(screen.getByText("詢問目前內容")).toHaveClass("visually-hidden");
    expect(screen.getByLabelText("AI 模型")).toHaveProperty(
      "parentElement",
      document.querySelector(".chat-form-actions")
    );
    expect(screen.getByText("Enter 送出 · Shift+Enter 換行"))
      .toHaveClass("chat-form-hint");

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "這句話的文法是什麼？" }
    });
    const sendButton = screen.getByRole("button", { name: "送出" });
    expect(sendButton).toHaveClass("send-message-button");
    expect(sendButton.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(sendButton);

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      text: "這句話的文法是什麼？",
      explanationLanguage: "source"
    }));
  });

  it("previews and saves the conversation font size from application settings", async () => {
    const snapshot = initialReadySnapshot();
    const { saveSettings } = installLibraryApi(books, {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage: vi.fn().mockResolvedValue(snapshot),
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "設定" }));
    const conversationSize = screen.getByRole("slider", {
      name: "AI 對話文字大小"
    });
    expect(conversationSize).toHaveAttribute("min", "12");
    expect(conversationSize).toHaveAttribute("max", "24");
    expect(conversationSize).toHaveValue("13");
    expect(screen.queryByRole("slider", {
      name: "電子書內文字大小"
    })).not.toBeInTheDocument();

    fireEvent.change(conversationSize, { target: { value: "18" } });

    expect(screen.getByText("18px")).toBeInTheDocument();
    expect(document.querySelector(".workspace")).toHaveStyle({
      "--ai-conversation-font-size": "18px",
      "--ebook-content-font-size": "19px",
      "--reading-paper-width": "760px",
      "--ebook-line-height": "1.9"
    });
    await waitFor(() => expect(saveSettings).toHaveBeenLastCalledWith({
      explanationLanguage: "source",
      aiConversationFontSize: 18,
      ebookContentFontSize: 19,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      reviewPaperSize: 10
    }));
  });

  it("saves daily completion limits and the review paper size from settings", async () => {
    const { review, saveSettings } = installLibraryApi();
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "設定" }));
    const newLimit = screen.getByRole("spinbutton", {
      name: "每日新項目完成上限"
    });
    const dueLimit = screen.getByRole("spinbutton", {
      name: "每日到期複習完成上限"
    });
    const paperSize = screen.getByRole("spinbutton", {
      name: "每份試卷題數"
    });
    expect(newLimit).toHaveValue(10);
    expect(dueLimit).toHaveValue(50);
    expect(paperSize).toHaveValue(10);
    await waitFor(() => expect(review.getSummary).toHaveBeenCalled());
    const summariesBeforeSave = review.getSummary.mock.calls.length;

    fireEvent.change(newLimit, { target: { value: "0" } });
    fireEvent.change(dueLimit, { target: { value: "80" } });
    fireEvent.change(paperSize, { target: { value: "6" } });

    await waitFor(() => expect(saveSettings).toHaveBeenLastCalledWith({
      explanationLanguage: "source",
      aiConversationFontSize: 13,
      ebookContentFontSize: 19,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 0,
      dailyDueReviewCompletionLimit: 80,
      reviewPaperSize: 6
    }));
    await waitFor(() => expect(review.getSummary.mock.calls.length)
      .toBeGreaterThan(summariesBeforeSave));
  });

  it("closes settings when clicking outside the card", async () => {
    const snapshot = initialReadySnapshot();
    installLibraryApi(books, {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage: vi.fn().mockResolvedValue(snapshot),
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "設定" }));
    const dialog = screen.getByRole("dialog", { name: "設定" });
    fireEvent.click(dialog);
    expect(dialog).toBeInTheDocument();

    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog", { name: "設定" }))
      .not.toBeInTheDocument();
  });

  it("controls and resets the global reading layout from the reader toolbar", async () => {
    const { saveSettings } = installLibraryApi();
    render(<App />);

    await screen.findByRole("heading", { name: "The First Book" });
    expect(screen.queryByRole("button", { name: "閱讀版面" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByLabelText("Opening 章節內容");

    fireEvent.click(screen.getByRole("button", { name: "閱讀版面" }));
    const layoutDialog = screen.getByRole("dialog", { name: "閱讀版面" });
    const ebookSize = screen.getByRole("slider", { name: "文字大小" });
    const paperWidth = screen.getByRole("slider", { name: "紙張寬度" });
    const lineHeight = screen.getByRole("slider", { name: "行間距" });

    expect(layoutDialog).toBeInTheDocument();
    expect(ebookSize).toHaveAttribute("min", "16");
    expect(ebookSize).toHaveAttribute("max", "32");
    expect(ebookSize).toHaveValue("19");
    expect(paperWidth).toHaveAttribute("min", "560");
    expect(paperWidth).toHaveAttribute("max", "960");
    expect(paperWidth).toHaveAttribute("step", "20");
    expect(paperWidth).toHaveValue("760");
    expect(lineHeight).toHaveAttribute("min", "1.4");
    expect(lineHeight).toHaveAttribute("max", "2.4");
    expect(lineHeight).toHaveAttribute("step", "0.1");
    expect(lineHeight).toHaveValue("1.9");

    fireEvent.change(ebookSize, { target: { value: "24" } });
    fireEvent.change(paperWidth, { target: { value: "900" } });
    fireEvent.change(lineHeight, { target: { value: "2.2" } });

    expect(screen.getByText("24px")).toBeInTheDocument();
    expect(screen.getByText("900px")).toBeInTheDocument();
    expect(screen.getByText("2.2×")).toBeInTheDocument();
    expect(document.querySelector(".workspace")).toHaveStyle({
      "--ebook-content-font-size": "24px",
      "--reading-paper-width": "900px",
      "--ebook-line-height": "2.2"
    });
    await waitFor(() => expect(saveSettings).toHaveBeenLastCalledWith({
      explanationLanguage: "source",
      aiConversationFontSize: 13,
      ebookContentFontSize: 24,
      readingPaperWidth: 900,
      ebookLineHeight: 2.2,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      reviewPaperSize: 10
    }));

    fireEvent.click(screen.getByRole("button", { name: "恢復預設值" }));
    expect(ebookSize).toHaveValue("19");
    expect(paperWidth).toHaveValue("760");
    expect(lineHeight).toHaveValue("1.9");
    await waitFor(() => expect(saveSettings).toHaveBeenLastCalledWith({
      explanationLanguage: "source",
      aiConversationFontSize: 13,
      ebookContentFontSize: 19,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      reviewPaperSize: 10
    }));

    fireEvent.click(screen.getByRole("button", {
      name: "關閉閱讀版面"
    }));
    expect(screen.queryByRole("dialog", { name: "閱讀版面" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "閱讀版面" }));
    fireEvent.click(screen.getByRole("button", { name: "閱讀版面" }));
    expect(screen.queryByRole("dialog", { name: "閱讀版面" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "閱讀版面" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "閱讀版面" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "閱讀版面" }));
    expect(screen.getByRole("dialog", { name: "閱讀版面" }))
      .toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "閱讀版面" }))
      .not.toBeInTheDocument();
  });

  it("does not submit Enter while an input method is composing text", async () => {
    const snapshot: ChatSnapshot = {
      ...initialReadySnapshot(),
      models: [],
      selectedModelId: null,
      modelCatalogDetail: "無法取得模型"
    };
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    installLibraryApi([], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);

    const input = await screen.findByLabelText("詢問目前內容");
    fireEvent.change(input, { target: { value: "中文選字" } });
    fireEvent.keyDown(input, {
      key: "Enter",
      keyCode: 229,
      isComposing: true
    });
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
  });

  it("shows reply progress in the conversation and exposes a stop action", async () => {
    const snapshot: ChatSnapshot = {
      ...initialReadySnapshot(),
      activeTurnId: "turn-1",
      stopRequested: false,
      threadId: "thread-1",
      models: [{
        id: "gpt-default",
        displayName: "GPT Default",
        defaultReasoningEffort: "medium"
      }],
      selectedModelId: "gpt-default",
      modelCatalogDetail: "已取得可用對話模型。"
    };
    const stopResponse = vi.fn().mockResolvedValue({
      ...snapshot,
      stopRequested: true
    });
    installLibraryApi([], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage: vi.fn().mockResolvedValue(snapshot),
      stopResponse,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);

    const progress = await screen.findByText("Codex 正在回覆…");
    expect(progress).toHaveClass("chat-reply-status");
    expect(progress.closest(".messages")).toBeInTheDocument();
    expect(screen.getByText("Enter 送出 · Shift+Enter 換行"))
      .toBeInTheDocument();
    expect(screen.getByLabelText("AI 模型")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    await waitFor(() => expect(stopResponse).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "停止中…" })).toBeDisabled();
  });

  it("shows a retry action for failed learning-item preparation", async () => {
    const failedSnapshot: ChatSnapshot = {
      ...initialReadySnapshot(),
      messages: [{
        id: "user-create-a",
        turnId: "turn-route-a",
        role: "user",
        text: "增加這張卡片",
        status: "completed",
        learningItemRequest: {
          targets: [{ title: "in advance" }]
        },
        learningItemPreparation: {
          status: "failed",
          targets: [{ title: "in advance" }],
          explanationLanguage: "zh-TW",
          error: "database busy"
        }
      }]
    };
    const retryLearningItemPreparation = vi.fn().mockResolvedValue({
      ...failedSnapshot,
      activeTurnId: "starting",
      messages: [{
        ...failedSnapshot.messages[0]!,
        learningItemPreparation: {
          ...failedSnapshot.messages[0]!.learningItemPreparation!,
          status: "preparing" as const,
          error: undefined
        }
      }]
    });
    installLibraryApi([], {
      getState: vi.fn().mockResolvedValue(failedSnapshot),
      connect: vi.fn().mockResolvedValue(failedSnapshot),
      retryLearningItemPreparation,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);

    expect(await screen.findByText("database busy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "重試準備卡片"
    }));
    await waitFor(() => expect(retryLearningItemPreparation)
      .toHaveBeenCalledWith("user-create-a"));
  });

  it("sends only the current reading segment as EPUB context", async () => {
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: 7 } }
    };
    const snapshot: ChatSnapshot = {
      connection: "ready",
      connectionDetail: "Codex 已連線。",
      account: { type: "plus" },
      allowance: {
        phase: "unavailable",
        fiveHour: null,
        weekly: null,
        detail: "無法取得"
      },
      messages: [],
      threadId: null,
      activeTurnId: null,
      conversations: [],
      activeConversationId: null,
      managementBusy: false
    };
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByText("Content for one-1");
    await waitFor(() => expect(screen.getByLabelText("詢問目前內容"))
      .not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "Explain this sentence" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      text: "Explain this sentence",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: "<reading-segment>Content</reading-segment>"
      }
    }));
  });

  it("resends reading content only after the reading range changes", async () => {
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: 7 } }
    };
    const snapshot: ChatSnapshot = {
      connection: "ready",
      connectionDetail: "Codex 已連線。",
      account: { type: "plus" },
      allowance: {
        phase: "unavailable",
        fiveHour: null,
        weekly: null,
        detail: "無法取得"
      },
      messages: [],
      threadId: "thread-1",
      activeTurnId: null,
      conversations: [],
      activeConversationId: null,
      managementBusy: false
    };
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByText("Content for one-1");
    await waitFor(() => expect(screen.getByLabelText("詢問目前內容"))
      .not.toBeDisabled());

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "First question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenNthCalledWith(1, {
      text: "First question",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: "<reading-segment>Content</reading-segment>"
      }
    });

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "Follow-up" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      text: "Follow-up",
      explanationLanguage: "source"
    });

    fireEvent.click(screen.getByRole("button", { name: "完成這段，前往下一段" }));
    await waitFor(() => expect(screen.getByRole("button", {
      name: "閱讀區段起點"
    })).not.toHaveAttribute("data-text-offset", "0"));
    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "New range" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(3));
    expect(sendMessage).toHaveBeenNthCalledWith(3, {
      text: "New range",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: "<reading-segment>for</reading-segment>"
      }
    });

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "New range follow-up" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(4));
    expect(sendMessage).toHaveBeenNthCalledWith(4, {
      text: "New range follow-up",
      explanationLanguage: "source"
    });
  });

  it("resends reading content after switching chapters with equal offsets", async () => {
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: {
        "one-1": { start: 0, end: 7 },
        "one-2": { start: 0, end: 7 }
      }
    };
    const snapshot: ChatSnapshot = {
      connection: "ready",
      connectionDetail: "Codex 已連線。",
      account: { type: "plus" },
      allowance: {
        phase: "unavailable",
        fiveHour: null,
        weekly: null,
        detail: "無法取得"
      },
      messages: [],
      threadId: "thread-1",
      activeTurnId: null,
      conversations: [],
      activeConversationId: null,
      managementBusy: false
    };
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByText("Content for one-1");
    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "Opening question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "下一章" }));
    await screen.findByText("Content for one-2");
    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "New chapter question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      text: "New chapter question",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "A New Road",
        readingSegment: "<reading-segment>Content</reading-segment>"
      }
    });
  });

  it("retries unsent reading content after the bridge rejects a message", async () => {
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: 7 } }
    };
    const snapshot: ChatSnapshot = {
      connection: "ready",
      connectionDetail: "Codex 已連線。",
      account: { type: "plus" },
      allowance: {
        phase: "unavailable",
        fiveHour: null,
        weekly: null,
        detail: "無法取得"
      },
      messages: [],
      threadId: "thread-1",
      activeTurnId: null,
      conversations: [],
      activeConversationId: null,
      managementBusy: false
    };
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error("bridge unavailable"))
      .mockResolvedValue(snapshot);
    installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByText("Content for one-1");

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "Failed question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(await screen.findByText("bridge unavailable")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "Retry question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage.mock.calls[0]?.[0].context?.readingSegment)
      .toBe("<reading-segment>Content</reading-segment>");
    expect(sendMessage.mock.calls[1]?.[0].context?.readingSegment)
      .toBe("<reading-segment>Content</reading-segment>");
  });

  it("opens the persistent learning library while keeping the AI assistant", async () => {
    installLibraryApi();
    render(<App />);

    await screen.findByRole("heading", { name: "The First Book" });
    expect(await screen.findByRole("button", { name: /生詞庫 1/ }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /生詞庫 1/ }));

    expect(await screen.findByRole("heading", { name: "生詞庫" }))
      .toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /reluctant/ }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("AI 助教")).toBeInTheDocument();
    expect(screen.queryByText("Anki 式間隔複習")).not.toBeInTheDocument();
  });

  it("opens the independent spaced review workspace without generating automatically", async () => {
    const { review } = installLibraryApi();
    render(<App />);

    expect(await screen.findByRole("button", { name: /間隔複習 1/ }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /間隔複習 1/ }));

    expect(await screen.findByRole("heading", { name: "間隔複習" }))
      .toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("spaced-review-content");
    expect(screen.getByRole("main")).not.toHaveClass(
      "learning-library-content"
    );
    expect(screen.getByText("1 題")).toBeInTheDocument();
    expect(review.generatePaper).not.toHaveBeenCalled();
    expect(screen.getByLabelText("AI 助教")).toBeInTheDocument();
  });

  it("continues generating a review paper while another workspace is open", async () => {
    const { review } = installLibraryApi();
    let resolvePaper: ((paper: ReviewPaper) => void) | undefined;
    review.generatePaper.mockImplementation(() => new Promise<ReviewPaper>(
      (resolve) => {
        resolvePaper = resolve;
      }
    ));
    const { unmount } = render(<App />);

    fireEvent.click(await screen.findByRole("button", {
      name: /間隔複習 1/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    expect(await screen.findByRole("region", {
      name: "AI 生成試卷"
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /生詞庫 1/ }));
    expect(await screen.findByRole("heading", { name: "生詞庫" }))
      .toBeInTheDocument();
    expect(review.discardPaper).not.toHaveBeenCalled();

    resolvePaper?.({
      paperId: "paper-background",
      questions: [{
        questionId: "q-background",
        itemId: "learning-1",
        title: "reluctant",
        sense: "unwilling",
        cefr: "B2",
        beforeTarget: "She felt ",
        targetText: "reluctant",
        afterTarget: " to leave."
      }]
    });
    fireEvent.click(screen.getByRole("button", { name: /間隔複習 1/ }));

    expect(await screen.findByText("reluctant", { selector: "u" }))
      .toBeInTheDocument();
    expect(review.generatePaper).toHaveBeenCalledOnce();
    expect(review.discardPaper).not.toHaveBeenCalled();

    unmount();
    expect(review.discardPaper).toHaveBeenCalledOnce();
  });

  it("shows generating and resumable review-paper icons in the sidebar", async () => {
    const { review } = installLibraryApi();
    review.generatePaper
      .mockImplementationOnce(() => new Promise<ReviewPaper>(() => undefined))
      .mockResolvedValueOnce({
        paperId: "paper-status",
        questions: [{
          questionId: "q-status",
          itemId: "learning-1",
          title: "reluctant",
          sense: "unwilling",
          cefr: "B2",
          beforeTarget: "She felt ",
          targetText: "reluctant",
          afterTarget: " to leave."
        }]
      });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", {
      name: /間隔複習 1/
    }));
    expect(document.querySelector(".review-sidebar-status"))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "生成本回合試卷"
    }));

    expect(await screen.findByRole("button", { name: /試卷生成中/ }))
      .toBeInTheDocument();
    expect(document.querySelector(".review-sidebar-status.generating"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消生成" }));
    expect(await screen.findByRole("button", {
      name: "間隔複習 1"
    })).toBeInTheDocument();
    expect(document.querySelector(".review-sidebar-status"))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "生成本回合試卷"
    }));

    expect(await screen.findByRole("button", {
      name: /試卷已生成，可繼續/
    })).toBeInTheDocument();
    expect(document.querySelector(".review-sidebar-status.resumable"))
      .toBeInTheDocument();
  });

  it("keeps review answers when switching workspaces", async () => {
    const { review } = installLibraryApi();
    review.generatePaper.mockResolvedValue({
      paperId: "paper-answering",
      questions: [{
        questionId: "q-answering",
        itemId: "learning-1",
        title: "reluctant",
        sense: "unwilling",
        cefr: "B2",
        beforeTarget: "She felt ",
        targetText: "reluctant",
        afterTarget: " to leave."
      }]
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", {
      name: /間隔複習 1/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    const answer = await screen.findByLabelText("這個詞在句中的意思");
    fireEvent.change(answer, { target: { value: "不情願的" } });

    fireEvent.click(screen.getByRole("button", { name: /生詞庫 1/ }));
    await screen.findByRole("heading", { name: "生詞庫" });
    fireEvent.click(screen.getByRole("button", { name: /間隔複習 1/ }));

    expect(await screen.findByLabelText("這個詞在句中的意思"))
      .toHaveValue("不情願的");
    expect(review.generatePaper).toHaveBeenCalledOnce();
  });

  it("keeps review feedback and rating overrides when switching workspaces", async () => {
    const { review } = installLibraryApi();
    review.generatePaper.mockResolvedValue({
      paperId: "paper-reviewing",
      questions: [{
        questionId: "q-reviewing",
        itemId: "learning-1",
        title: "reluctant",
        sense: "unwilling",
        cefr: "B2",
        beforeTarget: "She felt ",
        targetText: "reluctant",
        afterTarget: " to leave."
      }]
    });
    review.gradePaper.mockResolvedValue({
      paperId: "paper-reviewing",
      results: [{
        questionId: "q-reviewing",
        itemId: "learning-1",
        feedback: "核心語義正確。",
        rating: "easy"
      }]
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", {
      name: /間隔複習 1/
    }));
    fireEvent.click(await screen.findByRole("button", {
      name: "生成本回合試卷"
    }));
    fireEvent.change(await screen.findByLabelText("這個詞在句中的意思"), {
      target: { value: "不情願的" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交試卷" }));
    expect(await screen.findByText("核心語義正確。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "困難" }));

    fireEvent.click(screen.getByRole("button", { name: /生詞庫 1/ }));
    await screen.findByRole("heading", { name: "生詞庫" });
    fireEvent.click(screen.getByRole("button", { name: /間隔複習 1/ }));

    expect(await screen.findByText("核心語義正確。")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "困難" })).toBeChecked();
    expect(review.gradePaper).toHaveBeenCalledOnce();
  });

  it("orders reader chat presets as explanation, card creation, then practice", async () => {
    installLibraryApi();
    render(<App />);

    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByLabelText("Opening 章節內容");

    const readerPresetBar = screen.getByLabelText("提問快捷功能");
    expect(Array.from(readerPresetBar.querySelectorAll("button")).map(
      (button) => button.textContent?.trim()
    )).toEqual(["解釋標記", "新增卡片", "閱讀測驗"]);

    fireEvent.click(screen.getByRole("button", { name: /生詞庫 1/ }));
    await screen.findByRole("heading", { name: "生詞庫" });

    const libraryPresetBar = screen.getByLabelText("提問快捷功能");
    expect(Array.from(libraryPresetBar.querySelectorAll("button")).map(
      (button) => button.textContent?.trim()
    )).toEqual(["新增卡片"]);
  });

  it("starts learning-card creation and opens invitation and draft actions", async () => {
    const batch: LearningItemDraftBatch = {
      id: "batch-1",
      status: "pending",
      drafts: [{
        id: "draft-1",
        title: "look into",
        itemType: "phrase",
        cefr: "B1",
        sense: "investigate",
        markdownContent: "## Meaning\n調查",
        state: "included"
      }],
      existing: [],
      trashed: []
    };
    const snapshot: ChatSnapshot = {
      ...initialReadySnapshot(),
      messages: [{
        id: "assistant-invitation",
        turnId: "turn-invitation",
        role: "assistant",
        text: "要把這些單字和片語加入卡片庫嗎？",
        status: "completed",
        learningItemInvitation: {
          targets: [{ title: "bank", senseHint: "river bank" }]
        }
      }, {
        id: "assistant-batch",
        turnId: "turn-batch",
        role: "assistant",
        text: "已準備好卡片。",
        status: "completed",
        learningItemBatch: batch
      }]
    };
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    installLibraryApi([], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      updateLearningItemDraft: vi.fn().mockResolvedValue(snapshot),
      setLearningItemDraftState: vi.fn().mockResolvedValue(snapshot),
      submitLearningItemBatch: vi.fn().mockResolvedValue(snapshot),
      restoreLearningItemMatch: vi.fn().mockResolvedValue(snapshot),
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /生詞庫/ }));
    await screen.findByRole("heading", { name: "生詞庫" });

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "bank,\nlook into" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新增卡片" }));
    await waitFor(() => expect(sendMessage).toHaveBeenNthCalledWith(1, {
      text: "新增卡片：bank、look into",
      intent: "createLearningItems",
      explanationLanguage: "source",
      learningItemTargets: [{ title: "bank" }, { title: "look into" }]
    }));

    fireEvent.click(screen.getByRole("button", { name: "加入生詞庫" }));
    await waitFor(() => expect(sendMessage).toHaveBeenNthCalledWith(2, {
      text: "新增卡片：bank",
      intent: "createLearningItems",
      explanationLanguage: "source",
      learningItemTargets: [{ title: "bank", senseHint: "river bank" }]
    }));

    fireEvent.click(screen.getByRole("button", {
      name: "1 張卡片待確認"
    }));
    expect(screen.getByRole("dialog", { name: "確認卡片" }))
      .toBeInTheDocument();
    expect(screen.getByText("look into")).toBeInTheDocument();
  });

  it("sends natural-language creation requests unchanged for AI intent routing", async () => {
    const snapshot = initialReadySnapshot();
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    installLibraryApi([], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /生詞庫/ }));
    await screen.findByRole("heading", { name: "生詞庫" });

    const creationRequests = [
      "add this card",
      "Could you save this as a flashcard?",
      "把這個加入生詞庫",
      "幫我做成學習卡片"
    ];
    for (const text of creationRequests) {
      const expectedCall = sendMessage.mock.calls.length + 1;
      fireEvent.change(screen.getByLabelText("詢問目前內容"), {
        target: { value: text }
      });
      fireEvent.click(screen.getByRole("button", { name: "送出" }));
      await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(expectedCall));
      expect(sendMessage).toHaveBeenNthCalledWith(expectedCall, {
        text,
        explanationLanguage: "source"
      });
    }

    const ordinaryMessages = [
      'What does "add this card" mean?',
      "I can't add this card",
      "don't add this card",
      "不要新增這張卡片"
    ];
    for (const text of ordinaryMessages) {
      const expectedCall = sendMessage.mock.calls.length + 1;
      fireEvent.change(screen.getByLabelText("詢問目前內容"), {
        target: { value: text }
      });
      fireEvent.click(screen.getByRole("button", { name: "送出" }));
      await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(expectedCall));
      expect(sendMessage).toHaveBeenNthCalledWith(expectedCall, {
        text,
        explanationLanguage: "source"
      });
    }
  });

  it("asks the creation skill what to add when an explanation invitation is empty", async () => {
    const snapshot: ChatSnapshot = {
      ...initialReadySnapshot(),
      messages: [{
        id: "assistant-empty-invitation",
        turnId: "turn-invitation",
        role: "assistant",
        text: "這次沒有可直接加入的單字或片語。",
        status: "completed",
        learningItemInvitation: { targets: [] }
      }]
    };
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    installLibraryApi([], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "加入生詞庫" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      text: "新增卡片",
      intent: "createLearningItems",
      explanationLanguage: "source"
    }));
  });

  it("uses book selection as the only overview entry and omits the learning mechanism copy", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: /書籍總覽/ }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生詞庫/ }).querySelector("svg"))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定" }).querySelector("svg"))
      .toBeInTheDocument();
    expect(screen.queryByText("章節機制")).not.toBeInTheDocument();
    expect(screen.queryByText("閱讀與劃線")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 集中解析")).not.toBeInTheDocument();
    expect(screen.queryByText("加入生詞庫")).not.toBeInTheDocument();
    expect(screen.queryByText("Anki 複習是另一套獨立排程。"))
      .not.toBeInTheDocument();
  });

  it("adds a user message returned by the AI conversation bridge", async () => {
    const ready = {
      connection: "ready" as const,
      connectionDetail: "Codex 已連線。",
      account: { type: "plus" },
      allowance: {
        phase: "unavailable" as const,
        fiveHour: null,
        weekly: null,
        detail: "無法取得"
      },
      messages: [],
      threadId: null,
      activeTurnId: null,
      conversations: [],
      activeConversationId: null,
      managementBusy: false
    };
    const answered = {
      ...ready,
      messages: [{
        id: "user-1",
        turnId: "turn-1",
        role: "user" as const,
        text: "這句話的文法是什麼？",
        status: "completed" as const
      }],
      threadId: "thread-1"
    };
    Object.defineProperty(window, "readerDesktop", {
      configurable: true,
      value: {
        chat: {
          getState: vi.fn().mockResolvedValue(ready),
          connect: vi.fn().mockResolvedValue(ready),
          sendMessage: vi.fn().mockResolvedValue(answered),
          onStateChanged: vi.fn().mockReturnValue(() => undefined)
        }
      }
    });
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("詢問目前內容"))
      .not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "這句話的文法是什麼？" }
    });
    expect(screen.getByRole("button", { name: "送出" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(await screen.findByText("這句話的文法是什麼？"))
      .toBeInTheDocument();
  });

  it("manages the global conversation list from the AI conversation panel", async () => {
    const snapshot: ChatSnapshot = {
      connection: "ready",
      connectionDetail: "Codex 已連線。",
      account: { type: "plus" },
      allowance: {
        phase: "unavailable",
        fiveHour: null,
        weekly: null,
        detail: "無法取得"
      },
      messages: [{
        id: "user-latest",
        turnId: "turn-latest",
        role: "user",
        text: "Latest question",
        status: "completed"
      }],
      threadId: "thread-latest",
      activeTurnId: null,
      conversations: [{
        id: "latest",
        title: "Latest question",
        createdAt: 200,
        updatedAt: 300,
        source: { bookTitle: "The First Book", chapterTitle: "Opening" }
      }, {
        id: "older",
        title: "Older question",
        createdAt: 100,
        updatedAt: 150,
        source: null
      }],
      activeConversationId: "latest",
      managementBusy: false
    };
    const startNewConversation = vi.fn().mockResolvedValue({
      ...snapshot,
      messages: [],
      threadId: null,
      activeConversationId: null
    });
    const selectConversation = vi.fn().mockResolvedValue(snapshot);
    const removeConversation = vi.fn().mockResolvedValue(snapshot);
    installLibraryApi(books, {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage: vi.fn().mockResolvedValue(snapshot),
      startNewConversation,
      selectConversation,
      removeConversation,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });

    render(<App />);
    await screen.findByText("Latest question", { selector: ".message-content p" });

    fireEvent.click(screen.getByRole("button", { name: "對話紀錄" }));
    expect(screen.getByRole("heading", { name: "所有 AI 對話" }))
      .toBeInTheDocument();
    expect(screen.getByText("The First Book · Opening")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "開啟 Older question" }));
    await waitFor(() => expect(selectConversation).toHaveBeenCalledWith("older"));

    fireEvent.click(screen.getByRole("button", { name: "對話紀錄" }));
    fireEvent.click(screen.getByRole("button", { name: "移除 Older question" }));
    expect(screen.queryByRole("dialog", { name: "移除 AI 對話？" }))
      .not.toBeInTheDocument();
    await waitFor(() => expect(removeConversation).toHaveBeenCalledWith("older"));

    fireEvent.click(screen.getByRole("button", { name: "新對話" }));
    await waitFor(() => expect(startNewConversation).toHaveBeenCalledOnce());
  });

  it("renders compact role-aware messages with safe GitHub Flavored Markdown", async () => {
    const snapshot: ChatSnapshot = {
      connection: "ready",
      connectionDetail: "Codex 已連線。",
      account: { type: "plus" },
      allowance: {
        phase: "unavailable",
        fiveHour: null,
        weekly: null,
        detail: "無法取得"
      },
      messages: [
        {
          id: "user-1",
          turnId: "turn-1",
          role: "user",
          text: "請整理這一段",
          status: "completed"
        },
        {
          id: "assistant-1",
          turnId: "turn-1",
          role: "assistant",
          text: [
            "## 章節重點",
            "",
            "這是 **粗體**、[外部連結](https://example.com) 與 `inlineCode`。",
            "",
            "- 第一點",
            "- 第二點",
            "",
            "> 一段引用",
            "",
            "```ts",
            "const answer = 42;",
            "```",
            "",
            "| 項目 | 說明 |",
            "| --- | --- |",
            "| A | B |",
            "",
            "<span data-testid=\"unsafe-html\">不可信 HTML</span>"
          ].join("\n"),
          status: "completed"
        }
      ],
      threadId: "thread-1",
      activeTurnId: null,
      conversations: [],
      activeConversationId: null,
      managementBusy: false
    };
    installLibraryApi([], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage: vi.fn().mockResolvedValue(snapshot),
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });

    render(<App />);

    const userMessage = await screen.findByLabelText("使用者訊息");
    const assistantMessage = screen.getByLabelText("AI 回覆");
    expect(userMessage).toHaveClass("user");
    expect(assistantMessage).toHaveClass("assistant");
    expect(userMessage.querySelector(":scope > .message-role"))
      .not.toBeInTheDocument();
    expect(assistantMessage.querySelector(":scope > .message-role"))
      .not.toBeInTheDocument();
    expect(assistantMessage.querySelector("h2")).toHaveTextContent("章節重點");
    expect(assistantMessage.querySelector("strong")).toHaveTextContent("粗體");
    expect(assistantMessage.querySelectorAll("li")).toHaveLength(2);
    expect(assistantMessage.querySelector("blockquote"))
      .toHaveTextContent("一段引用");
    expect(assistantMessage.querySelector("code")).toHaveTextContent("inlineCode");
    expect(assistantMessage.querySelector("pre code"))
      .toHaveTextContent("const answer = 42;");
    expect(assistantMessage.querySelector("table")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "外部連結" }))
      .toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "外部連結" }))
      .toHaveAttribute("rel", "noreferrer");
    expect(assistantMessage.querySelector("[data-testid='unsafe-html']"))
      .not.toBeInTheDocument();
  });

  it("keeps the streaming placeholder in the compact message body", async () => {
    const snapshot: ChatSnapshot = {
      connection: "ready",
      connectionDetail: "Codex 已連線。",
      account: { type: "plus" },
      allowance: {
        phase: "unavailable",
        fiveHour: null,
        weekly: null,
        detail: "無法取得"
      },
      messages: [{
        id: "assistant-1",
        turnId: "turn-1",
        role: "assistant",
        text: "",
        status: "streaming"
      }],
      threadId: "thread-1",
      activeTurnId: "turn-1",
      conversations: [],
      activeConversationId: null,
      managementBusy: false
    };
    installLibraryApi([], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage: vi.fn().mockResolvedValue(snapshot),
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });

    render(<App />);

    expect(await screen.findByLabelText("AI 回覆")).toHaveTextContent("…");
    expect(screen.getByRole("button", { name: "新對話" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "對話紀錄" })).toBeDisabled();
  });

  it("collapses and expands the left and right sidebars independently", () => {
    render(<App />);

    const workspace = document.querySelector(".workspace");
    const leftToggle = screen.getByRole("button", { name: "摺疊左側欄" });
    const rightToggle = screen.getByRole("button", { name: "摺疊右側欄" });
    expect(leftToggle.closest(".sidebar-heading")).toBeInTheDocument();
    expect(rightToggle.closest(".assistant-heading")).toBeInTheDocument();
    expect(leftToggle.querySelector("svg")).toBeInTheDocument();
    expect(rightToggle.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(leftToggle);
    expect(workspace).toHaveClass("left-collapsed");
    expect(screen.getByRole("button", { name: "展開左側欄" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("主要導覽")).toHaveClass("collapsed");
    expect(screen.getByLabelText("AI 助教")).not.toHaveClass("collapsed");

    fireEvent.click(rightToggle);
    expect(workspace).toHaveClass("left-collapsed", "right-collapsed");
    expect(screen.getByRole("button", { name: "展開右側欄" }))
      .toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "展開左側欄" }));
    fireEvent.click(screen.getByRole("button", { name: "展開右側欄" }));
    expect(workspace).not.toHaveClass("left-collapsed");
    expect(workspace).not.toHaveClass("right-collapsed");
  });

  it("resizes the AI conversation panel and restores its width after collapsing", () => {
    render(<App />);

    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (!workspace) throw new Error("workspace is missing");
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      bottom: 800,
      height: 800,
      left: 0,
      right: 1440,
      top: 0,
      width: 1440,
      x: 0,
      y: 0,
      toJSON: () => undefined
    });

    const resizeHandle = screen.getByRole("separator", {
      name: "調整 AI 對話面板寬度"
    });
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("360px");

    fireEvent.pointerDown(resizeHandle, { clientX: 920, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 820, pointerId: 1 });
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("460px");
    fireEvent.pointerUp(window, { clientX: 820, pointerId: 1 });

    fireEvent.click(screen.getByRole("button", { name: "摺疊右側欄" }));
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("48px");
    expect(screen.queryByRole("separator", {
      name: "調整 AI 對話面板寬度"
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展開右側欄" }));
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("460px");
    expect(screen.getByRole("separator", {
      name: "調整 AI 對話面板寬度"
    })).toBeInTheDocument();
  });

  it("limits pointer and keyboard resizing and restores width when dragging is cancelled", () => {
    render(<App />);

    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (!workspace) throw new Error("workspace is missing");
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      bottom: 800,
      height: 800,
      left: 0,
      right: 1400,
      top: 0,
      width: 1400,
      x: 0,
      y: 0,
      toJSON: () => undefined
    });

    const resizeHandle = screen.getByRole("separator", {
      name: "調整 AI 對話面板寬度"
    });

    fireEvent.pointerDown(resizeHandle, { clientX: 920, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 100, pointerId: 1 });
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("640px");
    fireEvent.pointerUp(window, { pointerId: 1 });

    fireEvent.pointerDown(resizeHandle, { clientX: 920, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 1500, pointerId: 2 });
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("280px");
    fireEvent.pointerUp(window, { pointerId: 2 });

    fireEvent.keyDown(resizeHandle, { key: "ArrowLeft" });
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("296px");
    fireEvent.keyDown(resizeHandle, { key: "ArrowRight" });
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("280px");

    fireEvent.pointerDown(resizeHandle, { clientX: 920, pointerId: 3 });
    fireEvent.pointerMove(window, { clientX: 820, pointerId: 3 });
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("380px");
    fireEvent.pointerCancel(window, { pointerId: 3 });
    expect(workspace.style.getPropertyValue("--right-sidebar-width"))
      .toBe("280px");
    expect(resizeHandle).toHaveAttribute("aria-valuemin", "280");
    expect(resizeHandle).toHaveAttribute("aria-valuemax", "640");
    expect(resizeHandle).toHaveAttribute("aria-valuenow", "280");
  });

  it("lists persisted books and switches to the selected book overview", async () => {
    installLibraryApi();
    render(<App />);

    expect(
      await screen.findByRole("button", { name: /The First Book/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The First Book" })
    ).toBeInTheDocument();
    expect(screen.getByText("2 個章節")).toBeInTheDocument();
    expect(screen.getByText("30% 已閱讀")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /The Second Book/ }));

    expect(
      screen.getByRole("heading", { name: "The Second Book" })
    ).toBeInTheDocument();
    expect(screen.getByText("Beginnings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開始閱讀" }))
      .toBeInTheDocument();
  });

  it("visually distinguishes subchapters in the book overview", async () => {
    const hierarchicalBook = {
      ...books[0],
      chapters: [
        {
          id: "chapter-one",
          title: "Chapter 1 The American Sound",
          order: 0,
          href: "chapter-one.xhtml",
          depth: 0,
          fragment: "chapter-one"
        },
        {
          id: "pure-sound",
          title: "Pure Sound",
          order: 1,
          href: "chapter-one.xhtml",
          depth: 1,
          fragment: "pure-sound"
        }
      ]
    } as LibraryBook;
    installLibraryApi([hierarchicalBook]);
    render(<App />);

    const subchapterTitle = await screen.findByText("Pure Sound");
    const subchapterRow = subchapterTitle.closest("li");
    expect(subchapterRow).toHaveClass("subchapter");
    expect(subchapterRow).toHaveAttribute("data-depth", "1");
    expect(subchapterRow).toHaveTextContent("子章節");
    expect(subchapterRow).toHaveTextContent("閱讀此節 →");
    expect(screen.getByText("Chapter 1 The American Sound").closest("li"))
      .not.toHaveClass("subchapter");
  });

  it("imports an EPUB through the desktop library and selects it", async () => {
    const { importBook } = installLibraryApi();
    importBook.mockResolvedValue({
      status: "imported",
      book: {
        id: "new-book",
        title: "Newly Imported",
        author: "New Author",
        coverDataUrl: null,
        progressPercent: 0,
        lastChapterId: null,
        readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
        chapters: [{ id: "new-1", title: "First Chapter", order: 0, href: "first.xhtml", depth: 0, fragment: null }]
      }
    });
    render(<App />);
    await screen.findByRole("button", { name: /The First Book/ });

    fireEvent.click(screen.getByRole("button", { name: "導入 EPUB" }));

    await waitFor(() => expect(importBook).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("heading", { name: "Newly Imported" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Newly Imported/ }))
      .toBeInTheDocument();
  });

  it("asks for confirmation and cancels without deleting the book", async () => {
    const { deleteBook } = installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));

    const dialog = screen.getByRole("dialog", { name: "刪除書籍？" });
    expect(dialog).toHaveTextContent("The First Book");
    expect(dialog).toHaveTextContent("無法復原");
    expect(deleteBook).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The First Book" }))
      .toBeInTheDocument();
    expect(deleteBook).not.toHaveBeenCalled();
  });

  it("deletes the selected book and selects the next book", async () => {
    const { deleteBook } = installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));
    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    await waitFor(() => expect(deleteBook).toHaveBeenCalledWith("book-one"));
    expect(await screen.findByRole("heading", { name: "The Second Book" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /The First Book/ }))
      .not.toBeInTheDocument();
  });

  it("selects the previous book when deleting the last book", async () => {
    installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /The Second Book/ }));

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));
    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    expect(await screen.findByRole("heading", { name: "The First Book" }))
      .toBeInTheDocument();
  });

  it("shows the empty library after deleting its only book", async () => {
    installLibraryApi([books[0]]);
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));
    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    expect(
      await screen.findByRole("heading", { name: "導入 EPUB 開始閱讀" })
    ).toBeInTheDocument();
    expect(screen.getByText("尚未導入書籍")).toBeInTheDocument();
  });

  it("keeps the book visible and reports an error when deletion fails", async () => {
    const { deleteBook } = installLibraryApi();
    deleteBook.mockRejectedValue(new Error("disk busy"));
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: "刪除書籍" }));
    fireEvent.click(screen.getByRole("button", { name: "永久刪除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "無法刪除這本書籍"
    );
    expect(screen.getByRole("heading", { name: "The First Book" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /The First Book/ }))
      .toBeInTheDocument();
  });

  it("moves between chapters and replaces the completion action with next chapter", async () => {
    const { getChapterContent } = installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: /A New Road/ }));

    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    expect(getChapterContent).toHaveBeenCalledWith("book-one", "one-2");
    expect(screen.queryByText("Chapter workspace")).not.toBeInTheDocument();
    expect(screen.getAllByText("A New Road")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "完成本章" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一章" })).toBeDisabled();
    const toolbar = screen.getByRole("group", { name: "章節導覽" })
      .closest(".reader-toolbar");
    expect(toolbar?.parentElement).toHaveClass("content", "reader-content");

    fireEvent.click(screen.getByRole("button", { name: "上一章" }));
    expect(await screen.findByText("Content for one-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一章" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "下一章" }));
    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    expect(getChapterContent).toHaveBeenLastCalledWith("book-one", "one-2");
  });

  it("starts at the top when moving to another chapter", async () => {
    const anchoredBook: LibraryBook = {
      ...books[0],
      chapters: [
        books[0].chapters[0],
        { ...books[0].chapters[1], fragment: "middle" }
      ]
    };
    installLibraryApi([anchoredBook]);
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    expect(await screen.findByText("Content for one-1")).toBeInTheDocument();

    const content = document.querySelector<HTMLElement>(".content");
    if (!content) throw new Error("missing content scroller");
    Object.defineProperties(content, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 }
    });
    content.scrollTop = 400;

    fireEvent.click(screen.getByRole("button", { name: "下一章" }));

    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    expect(content.scrollTop).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("moves to the next distinct chapter when EPUB navigation entries share an id", async () => {
    const bookWithDuplicateNavigationEntries: LibraryBook = {
      ...books[0],
      lastChapterId: null,
      readingState: { view: "overview", chapterId: null, scrollProgress: 0 },
      chapters: [
        { id: "shared", title: "Introduction", order: 0, href: "intro.xhtml", depth: 0, fragment: null },
        { id: "shared", title: "Introduction exercise", order: 1, href: "intro.xhtml", depth: 1, fragment: "exercise" },
        { id: "chapter-one", title: "Chapter One", order: 2, href: "one.xhtml", depth: 0, fragment: null }
      ]
    };
    const { getChapterContent } = installLibraryApi([bookWithDuplicateNavigationEntries]);
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: /01Introduction/ }));
    expect(await screen.findByText("Content for shared")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一章" }));

    expect(await screen.findByText("Content for chapter-one")).toBeInTheDocument();
    expect(getChapterContent).toHaveBeenLastCalledWith("book-one", "chapter-one");
  });

  it("returns to overview and persists that view for the selected book", async () => {
    const { saveReadingState } = installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByText("Content for one-1");

    fireEvent.click(screen.getByRole("button", { name: "返回總覽" }));

    expect(screen.getByRole("heading", { name: "The First Book" })).toBeInTheDocument();
    expect(saveReadingState).toHaveBeenCalledWith({
      bookId: "book-one",
      view: "overview",
      chapterId: "one-1",
      scrollProgress: 0
    });
  });

  it("restores each book to its own last view, chapter and reading position", async () => {
    const resumableBooks = [
      {
        ...books[0],
        readingState: { view: "reader" as const, chapterId: "one-2", scrollProgress: 0.5 }
      },
      books[1]
    ];
    installLibraryApi(resumableBooks);
    render(<App />);

    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    const content = document.querySelector<HTMLElement>(".content");
    if (!content) throw new Error("missing content scroller");
    Object.defineProperties(content, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 }
    });
    content.scrollTop = 400;
    fireEvent.click(screen.getByRole("button", { name: /The Second Book/ }));
    expect(screen.getByRole("heading", { name: "The Second Book" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /The First Book/ }));

    expect(await screen.findByText("Content for one-2")).toBeInTheDocument();
    await waitFor(() => expect(content.scrollTop).toBe(400));
  });

  it("shows exactly one start and one end range marker for the active chapter", async () => {
    installLibraryApi();
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });

    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));

    expect(await screen.findByRole("button", { name: "閱讀區段起點" }))
      .toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /閱讀區段(起點|終點)/ }))
      .toHaveLength(2);
    expect(screen.getByText("START", { selector: ".reading-range-divider-label" }))
      .toBeInTheDocument();
    expect(screen.getByText("END", { selector: ".reading-range-divider-label" }))
      .toBeInTheDocument();
    expect(document.querySelectorAll(".reading-range-divider")).toHaveLength(2);
  });

  it("separates start and end boundary lines when their positions overlap", async () => {
    const rangedBooks: LibraryBook[] = [{
      ...books[0],
      chapterRanges: { "one-1": { start: 10, end: 10 } }
    }];
    installLibraryApi(rangedBooks);
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByRole("button", { name: "閱讀區段起點" });

    const startBoundary = document.querySelector('[data-range-boundary="start"]');
    const endBoundary = document.querySelector('[data-range-boundary="end"]');
    expect(startBoundary).toHaveClass("is-overlapping");
    expect(endBoundary).toHaveClass("is-overlapping");
    expect(startBoundary).not.toBe(endBoundary);
  });

  it("moves a range marker from the current line menu and persists it", async () => {
    const { getChapterContent, saveReadingRange } = installLibraryApi();
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>First readable line.</p><p>Second readable line.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const second = await screen.findByText("Second readable line.");
    await waitFor(() => expect(saveReadingRange).toHaveBeenCalled());
    saveReadingRange.mockClear();

    fireEvent.contextMenu(second, { clientX: 120, clientY: 180 });
    const moveStart = screen.getByRole("menuitem", { name: "將起點移到這裡" });
    fireEvent.pointerDown(moveStart);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(moveStart);

    await waitFor(() => expect(saveReadingRange).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-one",
        chapterId: "one-1",
        range: expect.objectContaining({ start: expect.any(Number) })
      })
    ));
  });

  it("closes the current line range menu when pressing outside it", async () => {
    const { getChapterContent } = installLibraryApi();
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>First readable line.</p><p>Second readable line.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const second = await screen.findByText("Second readable line.");

    fireEvent.contextMenu(second, { clientX: 120, clientY: 180 });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "返回總覽" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("persists the last valid marker position immediately when a pointer drag is released in the gutter", async () => {
    const rangedBooks: LibraryBook[] = [{
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: 41 } }
    }];
    const { getChapterContent, saveReadingRange } = installLibraryApi(rangedBooks);
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>First readable line.</p><p>Second readable line.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const second = await screen.findByText("Second readable line.");
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPoint = vi.fn().mockReturnValue(second);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint
    });

    const marker = await screen.findByRole("button", { name: "閱讀區段起點" });
    expect(marker).not.toHaveAttribute("draggable");
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 12, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 50, clientY: 100 });
    expect(saveReadingRange).not.toHaveBeenCalled();
    expect(document.querySelector('[data-range-boundary="start"]'))
      .toHaveAttribute("data-text-offset", "20");

    elementFromPoint.mockReturnValue(null);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 12, clientY: 100 });

    await waitFor(() => expect(saveReadingRange).toHaveBeenCalled());
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
  });

  it("restores the original range when a pointer drag is cancelled", async () => {
    const rangedBooks: LibraryBook[] = [{
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: 41 } }
    }];
    const { getChapterContent, saveReadingRange } = installLibraryApi(rangedBooks);
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>First readable line.</p><p>Second readable line.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const second = await screen.findByText("Second readable line.");
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(second)
    });

    const marker = await screen.findByRole("button", { name: "閱讀區段起點" });
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 12, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 50, clientY: 100 });
    expect(marker).toHaveAttribute("data-text-offset", "20");
    fireEvent.pointerCancel(window, { pointerId: 1 });

    expect(marker).toHaveAttribute("data-text-offset", "0");
    expect(saveReadingRange).not.toHaveBeenCalled();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
  });

  it("moves end with start when a current-line start move crosses end", async () => {
    const rangedBooks: LibraryBook[] = [{
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: 10 } }
    }];
    const { getChapterContent, saveReadingRange } = installLibraryApi(rangedBooks);
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>First readable line.</p><p>Second readable line.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const second = await screen.findByText("Second readable line.");
    await screen.findByRole("button", { name: "閱讀區段起點" });

    fireEvent.contextMenu(second);
    const moveStart = screen.getByRole("menuitem", { name: "將起點移到這裡" });
    expect(moveStart).toBeEnabled();
    fireEvent.click(moveStart);

    await waitFor(() => expect(saveReadingRange).toHaveBeenCalledWith(
      expect.objectContaining({ range: { start: 20, end: 20 } })
    ));
  });

  it("moves end with start and persists when a start drag crosses end", async () => {
    const rangedBooks: LibraryBook[] = [{
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: 10 } }
    }];
    const { getChapterContent, saveReadingRange } = installLibraryApi(rangedBooks);
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>First readable line.</p><p>Second readable line.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const second = await screen.findByText("Second readable line.");
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(second)
    });

    const marker = await screen.findByRole("button", { name: "閱讀區段起點" });
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 12, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 100 });

    await waitFor(() => expect(saveReadingRange).toHaveBeenCalledWith(
      expect.objectContaining({ range: { start: 20, end: 20 } })
    ));
    expect(marker).toHaveAttribute("data-text-offset", "20");
    expect(screen.getByRole("button", { name: "閱讀區段終點" }))
      .toHaveAttribute("data-text-offset", "20");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
  });

  it("moves start with end when a current-line end move crosses start", async () => {
    const rangedBooks: LibraryBook[] = [{
      ...books[0],
      chapterRanges: { "one-1": { start: 30, end: 40 } }
    }];
    const { getChapterContent, saveReadingRange } = installLibraryApi(rangedBooks);
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>First readable line.</p><p>Second readable line.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const second = await screen.findByText("Second readable line.");
    await screen.findByRole("button", { name: "閱讀區段起點" });

    fireEvent.contextMenu(second);
    const moveEnd = screen.getByRole("menuitem", { name: "將終點移到這裡" });
    expect(moveEnd).toBeEnabled();
    fireEvent.click(moveEnd);

    await waitFor(() => expect(saveReadingRange).toHaveBeenCalledWith(
      expect.objectContaining({ range: { start: 20, end: 20 } })
    ));
    expect(screen.getByRole("button", { name: "閱讀區段起點" }))
      .toHaveAttribute("data-text-offset", "20");
  });

  it("starts both markers of an unsaved chapter range at the first line", async () => {
    const { getChapterContent } = installLibraryApi();
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "\n  <p>First readable line.</p><p>Second readable line.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));

    expect(await screen.findByRole("button", { name: "閱讀區段起點" }))
      .toHaveAttribute("data-text-offset", "0");
    expect(screen.getByRole("button", { name: "閱讀區段終點" }))
      .toHaveAttribute("data-text-offset", "0");
  });

  it("restores saved offsets and keeps them through layout changes", async () => {
    const savedBooks: LibraryBook[] = [{
      ...books[0],
      chapterRanges: { "one-1": { start: 3, end: 14 } }
    }];
    installLibraryApi(savedBooks);
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));

    const start = await screen.findByRole("button", { name: "閱讀區段起點" });
    expect(start).toHaveAttribute("data-text-offset", "3");
    fireEvent(window, new Event("resize"));
    expect(start).toHaveAttribute("data-text-offset", "3");
  });

  it("advances only from the explicit completion action and stops inside the chapter", async () => {
    const { getChapterContent, saveReadingRange } = installLibraryApi();
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: `<p>${Array.from({ length: 900 }, (_, index) => `word${index + 1}`).join(" ")}</p>`
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByRole("button", { name: "閱讀區段起點" });
    await waitFor(() => expect(saveReadingRange).toHaveBeenCalled());
    saveReadingRange.mockClear();

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "Explain this range" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));
    expect(saveReadingRange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "完成這段，前往下一段" }));
    await waitFor(() => expect(saveReadingRange).toHaveBeenCalledWith(
      expect.objectContaining({
        range: expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) })
      })
    ));
    const savedRange = saveReadingRange.mock.calls.at(-1)?.[0].range;
    expect(savedRange.end).toBeLessThanOrEqual(
      document.querySelector(".chapter-content")?.textContent?.length ?? 0
    );
  });

  it("creates consecutive persistent annotations in annotation mode and silently ignores overlap", async () => {
    const { getChapterContent, saveAnnotations } = installLibraryApi();
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>He was reluctant to admit that the plan had failed.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const article = await screen.findByLabelText("Opening 章節內容");

    const modeButton = screen.getByRole("button", {
      name: "開啟標記模式，目前章節 0 個標記"
    });
    fireEvent.click(modeButton);
    expect(screen.getByRole("button", {
      name: "關閉標記模式，目前章節 0 個標記"
    }))
      .toHaveAttribute("aria-pressed", "true");

    selectText(article, "reluctant");
    fireEvent.mouseUp(article);
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-one",
        chapterId: "one-1",
        annotations: [expect.objectContaining({ text: "reluctant" })]
      })
    ));
    expect(article.querySelector("mark[data-annotation-id]")?.textContent)
      .toBe("reluctant");
    expect(screen.getByRole("button", {
      name: "關閉標記模式，目前章節 1 個標記"
    })).toBeInTheDocument();

    selectText(article, "reluctant to admit");
    fireEvent.mouseUp(article);
    expect(saveAnnotations).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "關閉標記模式，目前章節 1 個標記"
    }));
    expect(screen.getByRole("button", {
      name: "開啟標記模式，目前章節 1 個標記"
    }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("shows a sticky annotation tool with the current chapter annotation count", async () => {
    const chapterText = "He was reluctant to admit the truth.";
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: 6 } },
      chapterAnnotations: {
        "one-1": [{
          id: "a1",
          start: chapterText.indexOf("truth"),
          end: chapterText.indexOf("truth") + "truth".length,
          text: "truth"
        }]
      }
    };
    const { getChapterContent } = installLibraryApi([rangedBook]);
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: `<p>${chapterText}</p>`
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByLabelText("Opening 章節內容");

    const tool = await screen.findByRole("button", {
      name: "開啟標記模式，目前章節 1 個標記"
    });
    expect(tool.closest(".annotation-tool-dock")).toBeInTheDocument();
    expect(tool.querySelector(".annotation-tool-count")).toHaveTextContent("1");
    expect(tool.querySelector(".annotation-tool-label")).toHaveTextContent("標記");
    expect(tool).not.toHaveAttribute("aria-describedby");
    expect(tool).not.toHaveAttribute("title");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(document.querySelector(
      ".reading-range-actions .annotation-mode-button"
    )).not.toBeInTheDocument();

    fireEvent.click(tool);
    expect(screen.getByRole("button", {
      name: "關閉標記模式，目前章節 1 個標記"
    })).toHaveAttribute("aria-pressed", "true");
    expect(tool.querySelector(".annotation-tool-label"))
      .toHaveTextContent("標記中");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("creates and removes an annotation from the existing right-click menu", async () => {
    const { getChapterContent, saveAnnotations } = installLibraryApi();
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: "<p>He was reluctant to admit the truth.</p>"
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const article = await screen.findByLabelText("Opening 章節內容");

    selectText(article, "the truth");
    fireEvent.contextMenu(article.querySelector("p")!, {
      clientX: 120,
      clientY: 180
    });
    expect(screen.getByRole("menuitem", { name: "將起點移到這裡" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "標記所選內容" }));
    await waitFor(() => expect(saveAnnotations).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", {
      name: "開啟標記模式，目前章節 1 個標記"
    })).toBeInTheDocument();

    const mark = article.querySelector("mark[data-annotation-id]") as HTMLElement;
    expect(mark.textContent).toBe("the truth");
    fireEvent.contextMenu(mark, { clientX: 140, clientY: 190 });
    fireEvent.click(screen.getByRole("menuitem", { name: "移除標記" }));

    await waitFor(() => expect(saveAnnotations).toHaveBeenLastCalledWith(
      expect.objectContaining({ annotations: [] })
    ));
    expect(article.querySelector("mark[data-annotation-id]")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "開啟標記模式，目前章節 0 個標記"
    })).toBeInTheDocument();
  });

  it("refreshes AI context after annotation changes while ordinary follow-ups remain normal", async () => {
    const chapterText = "He was reluctant to admit that the plan had failed.";
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: chapterText.length } },
      chapterAnnotations: {
        "one-1": [{
          id: "a1",
          start: chapterText.indexOf("reluctant"),
          end: chapterText.indexOf("reluctant") + "reluctant".length,
          text: "reluctant"
        }]
      }
    };
    const snapshot = initialReadySnapshot();
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    const { getChapterContent } = installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: `<p>${chapterText}</p>`
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByLabelText("Opening 章節內容");

    const ask = async (text: string) => {
      fireEvent.change(screen.getByLabelText("詢問目前內容"), {
        target: { value: text }
      });
      fireEvent.click(screen.getByRole("button", { name: "送出" }));
      await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text })
      ));
    };
    await ask("First question");
    expect(sendMessage).toHaveBeenNthCalledWith(1, {
      text: "First question",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation> to admit that the plan had failed.</reading-segment>'
      }
    });
    await ask("Follow-up");
    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      text: "Follow-up",
      explanationLanguage: "source"
    });

    fireEvent.click(screen.getByRole("button", { name: "解釋標記" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(3));
    expect(sendMessage).toHaveBeenNthCalledWith(3, {
      text: "講解標記內容",
      intent: "explainAnnotations",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation> to admit that the plan had failed.</reading-segment>'
      }
    });

    const article = screen.getByLabelText("Opening 章節內容");
    fireEvent.click(screen.getByRole("button", {
      name: /^開啟標記模式/
    }));
    selectText(article, "that the plan had failed.");
    fireEvent.mouseUp(article);
    await ask("After marking");
    expect(sendMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({
      text: "After marking",
      context: expect.objectContaining({
        readingSegment: expect.stringContaining(
          '<reader-annotation id="A2">that the plan had failed.</reader-annotation>'
        )
      })
    }));

    let mark = article.querySelector("mark[data-annotation-id]") as HTMLElement;
    fireEvent.contextMenu(mark, { clientX: 140, clientY: 190 });
    fireEvent.click(screen.getByRole("menuitem", { name: "移除標記" }));
    await waitFor(() => expect(article.querySelectorAll(
      "mark[data-annotation-id]"
    )).toHaveLength(1));
    mark = article.querySelector("mark[data-annotation-id]") as HTMLElement;
    fireEvent.contextMenu(mark, { clientX: 140, clientY: 190 });
    fireEvent.click(screen.getByRole("menuitem", { name: "移除標記" }));
    await waitFor(() => expect(article.querySelectorAll(
      "mark[data-annotation-id]"
    )).toHaveLength(0));
    await ask("After removing all marks");
    expect(sendMessage).toHaveBeenNthCalledWith(5, {
      text: "After removing all marks",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: "<reading-segment>He was reluctant to admit that the plan had failed.</reading-segment>"
      }
    });
  });

  it("uses the selected explanation language for annotation analysis and reading quiz presets", async () => {
    const chapterText = "He was reluctant.";
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: chapterText.length } },
      chapterAnnotations: {
        "one-1": [{ id: "a1", start: 7, end: 16, text: "reluctant" }]
      }
    };
    const snapshot = initialReadySnapshot();
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    const { getChapterContent, saveSettings } = installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: `<p>${chapterText}</p>`
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "設定" }));
    fireEvent.change(screen.getByLabelText("講解語言"), {
      target: { value: "ja" }
    });
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({
      explanationLanguage: "ja",
      aiConversationFontSize: 13,
      ebookContentFontSize: 19,
      readingPaperWidth: 760,
      ebookLineHeight: 1.9,
      dailyNewItemCompletionLimit: 10,
      dailyDueReviewCompletionLimit: 50,
      reviewPaperSize: 10
    }));
    fireEvent.click(screen.getByRole("button", { name: "關閉設定" }));
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const article = await screen.findByLabelText("Opening 章節內容");
    await waitFor(() => expect(article.querySelector(
      'mark[data-annotation-id="a1"]'
    )).toHaveTextContent("reluctant"));

    fireEvent.click(screen.getByRole("button", { name: "解釋標記" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      text: "講解標記內容",
      intent: "explainAnnotations",
      explanationLanguage: "ja",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation>.</reading-segment>'
      }
    }));

    fireEvent.click(screen.getByRole("button", { name: "閱讀測驗" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      text: "開始閱讀測驗",
      intent: "practiceReading",
      explanationLanguage: "ja",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation>.</reading-segment>'
      }
    }));
  });

  it("keeps annotation analysis available without annotations", async () => {
    const chapterText = "Nothing is marked.";
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: chapterText.length } }
    };
    const snapshot = initialReadySnapshot();
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    const { getChapterContent } = installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: `<p>${chapterText}</p>`
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByLabelText("Opening 章節內容");
    await waitFor(() => expect(screen.getByRole("button", {
      name: "閱讀區段終點"
    })).toHaveAttribute("data-text-offset", String(chapterText.length)));
    const preset = await screen.findByRole("button", { name: "解釋標記" });

    expect(preset).toBeEnabled();
    fireEvent.click(preset);

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      text: "講解標記內容",
      intent: "explainAnnotations",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: "<reading-segment>Nothing is marked.</reading-segment>"
      }
    }));
  });

  it("starts a reading comprehension quiz from the current range without annotations", async () => {
    const chapterText = "Nothing is marked, but the passage can still be tested.";
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: chapterText.length } }
    };
    const snapshot = initialReadySnapshot();
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    const { getChapterContent } = installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: `<p>${chapterText}</p>`
    });
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    await screen.findByLabelText("Opening 章節內容");

    fireEvent.change(screen.getByLabelText("詢問目前內容"), {
      target: { value: "First question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));

    const preset = screen.getByRole("button", { name: "閱讀測驗" });
    expect(preset).toBeEnabled();
    expect(preset).toHaveClass("reading-practice-preset");
    fireEvent.click(preset);

    expect(screen.queryByRole("dialog", { name: "閱讀測驗試卷" }))
      .not.toBeInTheDocument();

    await waitFor(() => expect(sendMessage).toHaveBeenNthCalledWith(2, {
      text: "開始閱讀測驗",
      intent: "practiceReading",
      explanationLanguage: "source",
      context: {
        bookTitle: "The First Book",
        chapterTitle: "Opening",
        readingSegment: `<reading-segment>${chapterText}</reading-segment>`
      }
    }));
  });

  it("expands and folds the reading paper inside its AI message", async () => {
    const chapterText = "The rain stopped when Anna reached the old bridge.";
    const rangedBook: LibraryBook = {
      ...books[0],
      chapterRanges: { "one-1": { start: 0, end: chapterText.length } }
    };
    const quiz = {
      version: 1,
      kind: "quiz",
      quizId: "quiz-bridge",
      title: "The Old Bridge",
      cefr: "B1",
      difficultySummary: "注意事件順序。",
      multipleChoice: [{
        id: "mc-1",
        number: 1,
        prompt: "雨何時停了？",
        options: {
          A: "Anna 到橋上時",
          B: "Anna 回家時",
          C: "天黑時",
          D: "故事開始前"
        }
      }],
      openEnded: [{
        id: "open-1",
        number: 2,
        prompt: "描述這個場景。"
      }]
    };
    const snapshot: ChatSnapshot = {
      ...initialReadySnapshot(),
      messages: [{
        id: "assistant-quiz",
        turnId: "turn-quiz",
        role: "assistant",
        text: `試卷已準備好。\n\n\`\`\`reading-practice-quiz\n${JSON.stringify(quiz)}\n\`\`\``,
        status: "completed"
      }]
    };
    const sendMessage = vi.fn().mockResolvedValue(snapshot);
    const { getChapterContent } = installLibraryApi([rangedBook], {
      getState: vi.fn().mockResolvedValue(snapshot),
      connect: vi.fn().mockResolvedValue(snapshot),
      sendMessage,
      onStateChanged: vi.fn().mockReturnValue(() => undefined)
    });
    getChapterContent.mockResolvedValue({
      bookId: "book-one",
      chapterId: "one-1",
      title: "Opening",
      fragment: null,
      contentHtml: `<p>${chapterText}</p>`
    });

    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    const article = await screen.findByLabelText("Opening 章節內容");

    expect(screen.queryByRole("region", { name: "The Old Bridge" }))
      .not.toBeInTheDocument();
    const paperArtifact = await screen.findByRole("button", {
      name: "開啟試卷：The Old Bridge"
    });
    const assistantMessage = paperArtifact.closest("article");
    expect(paperArtifact).toHaveTextContent("2 題");
    fireEvent.click(paperArtifact);

    const paper = screen.getByRole("region", { name: "The Old Bridge" });
    expect(assistantMessage).toContainElement(paper);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(article).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "收起試卷" }));
    expect(screen.queryByRole("region", { name: "The Old Bridge" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "開啟試卷：The Old Bridge"
    })).toBeInTheDocument();
  });

  it("turns annotation mode off when switching chapters", async () => {
    const annotatedBook: LibraryBook = {
      ...books[0],
      chapterAnnotations: {
        "one-1": [{ id: "a1", start: 0, end: 7, text: "Content" }],
        "one-2": [
          { id: "a2", start: 0, end: 7, text: "Content" },
          { id: "a3", start: 12, end: 17, text: "one-2" }
        ]
      }
    };
    installLibraryApi([annotatedBook]);
    render(<App />);
    await screen.findByRole("heading", { name: "The First Book" });
    fireEvent.click(screen.getByRole("button", { name: /Opening/ }));
    fireEvent.click(await screen.findByRole("button", {
      name: "開啟標記模式，目前章節 1 個標記"
    }));
    expect(screen.getByRole("button", {
      name: "關閉標記模式，目前章節 1 個標記"
    }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一章" }));

    await screen.findByText("Content for one-2");
    expect(await screen.findByRole("button", {
      name: "開啟標記模式，目前章節 2 個標記"
    }))
      .toHaveAttribute("aria-pressed", "false");
  });
});
