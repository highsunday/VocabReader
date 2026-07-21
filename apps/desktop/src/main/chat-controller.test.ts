import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ChatController,
  composeCodexInput
} from "./chat-controller";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import type {
  ChatConversationStore,
  StoredChatState
} from "./chat-conversation-store";
import { createFakeCodexAppServer } from "./fake-codex-app-server";

const annotationExplanationSkillPath =
  "/tmp/lingoshelf-codex-test/.agents/skills/explain-reader-annotations/SKILL.md";
const annotationExplanationSkillInstructions = readFileSync(resolve(
  process.cwd(),
  "../../.agents/skills/explain-reader-annotations/SKILL.md"
), "utf8");
const readingComprehensionSkillPath =
  "/tmp/lingoshelf-codex-test/.agents/skills/practice-reading-comprehension/SKILL.md";
const readingComprehensionSkillInstructions = [
  "name: practice-reading-comprehension",
  "Estimate the passage CEFR level.",
  "Create 8 to 12 multiple-choice questions.",
  "Provide a final review after grading."
].join("\n");

class MemoryChatConversationStore implements ChatConversationStore {
  state: StoredChatState;

  constructor(state?: StoredChatState) {
    this.state = structuredClone(state ?? {
      version: 1,
      selectedConversationId: null,
      conversations: []
    });
  }

  load(): StoredChatState {
    return structuredClone(this.state);
  }

  save(state: StoredChatState): void {
    this.state = structuredClone(state);
  }
}

class FailingSaveConversationStore extends MemoryChatConversationStore {
  failSave = false;

  override save(state: StoredChatState): void {
    if (this.failSave) throw new Error("disk full");
    super.save(state);
  }
}

function fixture(options: Parameters<typeof createFakeCodexAppServer>[0] = {}) {
  const fake = createFakeCodexAppServer(options);
  const controller = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient({
      spawnProcess: () => fake.child
    }),
    workingDirectory: "/tmp/lingoshelf-codex-test",
    annotationExplanationSkillPath,
    annotationExplanationSkillInstructions,
    readingComprehensionSkillPath,
    readingComprehensionSkillInstructions
  });
  return { fake, controller };
}

function managedFixture(store = new MemoryChatConversationStore()) {
  const fake = createFakeCodexAppServer();
  let conversationId = 0;
  let now = 1_000;
  const controller = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient({
      spawnProcess: () => fake.child
    }),
    workingDirectory: "/tmp/lingoshelf-codex-test",
    annotationExplanationSkillPath,
    annotationExplanationSkillInstructions,
    readingComprehensionSkillPath,
    readingComprehensionSkillInstructions,
    conversationStore: store,
    createConversationId: () => `conversation-${++conversationId}`,
    now: () => ++now
  });
  return { fake, controller, store };
}

async function waitUntil(check: () => boolean, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("等待 fake Codex 回應逾時。");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("ChatController", () => {
  it("initializes Codex before exposing the real account and normalized allowances", async () => {
    const { fake, controller } = fixture();
    const states: Array<{ connection: string; allowance: string }> = [];
    const unsubscribe = controller.onStateChanged((state) => {
      states.push({
        connection: state.connection,
        allowance: state.allowance.phase
      });
    });

    const snapshot = await controller.connect();

    expect(snapshot.connection).toBe("ready");
    expect(snapshot.account).toEqual({
      type: "plus",
      email: "learner@example.com"
    });
    expect(snapshot.allowance.fiveHour).toEqual({
      remainingPercent: 76,
      resetsAt: 1_700_000_000
    });
    expect(snapshot.allowance.weekly).toEqual({
      remainingPercent: 62,
      resetsAt: 1_800_000_000
    });
    expect(fake.requests.map((request) => request.method).slice(0, 4))
      .toEqual([
        "initialize",
        "initialized",
        "account/read",
        "account/rateLimits/read"
      ]);
    expect(states).toContainEqual({
      connection: "ready",
      allowance: "loading"
    });
    unsubscribe();
    controller.close();
  });

  it("loads visible models and applies the selected model to new threads and turns", async () => {
    const { fake, controller } = fixture();

    const connected = await controller.connect();
    expect(connected.models?.map((model) => model.id))
      .toEqual(["gpt-default", "gpt-reader"]);
    expect(connected.selectedModelId).toBe("gpt-default");

    controller.selectModel("gpt-reader");
    await controller.sendMessage({ text: "Explain this" });

    const threadStart = fake.requests.find(
      (request) => request.method === "thread/start"
    );
    const turnStart = fake.requests.find(
      (request) => request.method === "turn/start"
    );
    expect(threadStart?.params?.model).toBe("gpt-reader");
    expect(turnStart?.params).toMatchObject({
      model: "gpt-reader",
      effort: "high"
    });
    controller.close();
  });

  it("keeps chat usable with the Codex default when the model catalog fails", async () => {
    const { fake, controller } = fixture({ modelListError: "catalog offline" });

    const connected = await controller.connect();
    expect(connected.models).toEqual([]);
    expect(connected.modelCatalogDetail).toMatch(/catalog offline/);
    await controller.sendMessage({ text: "Use the default" });

    const turnStart = fake.requests.find(
      (request) => request.method === "turn/start"
    );
    expect(turnStart?.params?.model).toBeUndefined();
    expect(turnStart?.params?.effort).toBeUndefined();
    controller.close();
  });

  it("interrupts the active Codex turn", async () => {
    const { fake, controller } = fixture({ turnDelayMs: 80 });
    await controller.connect();
    await controller.sendMessage({ text: "Long answer" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === "turn-1");

    await controller.stopResponse();
    await controller.stopResponse();

    expect(fake.requests.filter(
      (request) => request.method === "turn/interrupt"
    )).toEqual([expect.objectContaining({
      params: { threadId: "thread-1", turnId: "turn-1" }
    })]);
    expect(controller.getSnapshot().stopRequested).toBe(true);
    controller.close();
  });

  it("waits for a starting thread and turn before interrupting", async () => {
    const { fake, controller } = fixture({
      threadStartDelayMs: 30,
      turnDelayMs: 80
    });
    await controller.connect();
    const send = controller.sendMessage({ text: "Stop immediately" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === "starting");

    const stop = controller.stopResponse();
    await send;
    await stop;

    expect(fake.requests.filter(
      (request) => request.method === "turn/interrupt"
    )).toEqual([expect.objectContaining({
      params: { threadId: "thread-1", turnId: "turn-1" }
    })]);
    controller.close();
  });

  it("streams two answers on one thread while keeping reader context out of the visible user message", async () => {
    const { fake, controller } = fixture();
    await controller.connect();

    await controller.sendMessage({
      text: "What does this mean?",
      context: {
        bookTitle: "A Book",
        chapterTitle: "Opening",
        readingSegment: "Only this selected sentence."
      }
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({ text: "And the grammar?" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    const snapshot = controller.getSnapshot();
    expect(snapshot.threadId).toBe("thread-1");
    expect(snapshot.messages.filter((message) => message.role === "user")
      .map((message) => message.text))
      .toEqual(["What does this mean?", "And the grammar?"]);
    const threadStarts = fake.requests.filter(
      (request) => request.method === "thread/start"
    );
    const turnStarts = fake.requests.filter(
      (request) => request.method === "turn/start"
    );
    expect(threadStarts).toHaveLength(1);
    expect(turnStarts).toHaveLength(2);
    expect(turnStarts.every(
      (request) => request.params?.threadId === "thread-1"
    )).toBe(true);
    expect(JSON.stringify(turnStarts[0]?.params)).toContain(
      "Only this selected sentence."
    );
    expect(JSON.stringify(turnStarts[1]?.params)).not.toContain("A Book");
    expect(snapshot.messages.filter((message) => message.role === "assistant"))
      .toHaveLength(2);
    expect(snapshot.messages.every((message) => message.status === "completed"))
      .toBe(true);
    controller.close();
  });

  it("injects only the matching App skill for each preset action", async () => {
    const { fake, controller } = fixture();
    await controller.connect();

    await controller.sendMessage({ text: "What does this mean?" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({
      text: "開始閱讀測驗",
      intent: "practiceReading",
      context: {
        readingSegment: "<reading-segment>A short passage.</reading-segment>"
      }
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({
      text: "講解標記內容",
      intent: "explainAnnotations",
      explanationLanguage: "zh-TW",
      context: {
        readingSegment: '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation>.</reading-segment>'
      }
    });

    const turnStarts = fake.requests.filter(
      (request) => request.method === "turn/start"
    );
    const threadStart = fake.requests.find(
      (request) => request.method === "thread/start"
    );
    const loadedInstructions = String(
      threadStart?.params?.developerInstructions ?? ""
    );
    expect(loadedInstructions).toContain("explain-reader-annotations");
    expect(loadedInstructions).toContain("practice-reading-comprehension");
    expect(loadedInstructions).toContain(
      "Judge the item as used in this passage, not in isolation"
    );
    expect(loadedInstructions).toContain(
      "Marked item | Simple meaning | CEFR level | Useful note"
    );
    expect(loadedInstructions).toContain("Create 8 to 12 multiple-choice questions");
    expect(loadedInstructions).toContain(
      "continue using its assessment workflow"
    );
    expect(loadedInstructions.match(/<app-provided-skill /g)).toHaveLength(2);
    expect(loadedInstructions).not.toContain("Available skills:");
    expect(threadStart?.params?.config).toMatchObject({
      "skills.include_instructions": false,
      "skills.bundled.enabled": false,
      "features.plugins": false,
      "features.apps": false
    });
    const ordinaryInput = turnStarts[0]?.params?.input;
    const practiceInput = turnStarts[1]?.params?.input;
    const explanationInput = turnStarts[2]?.params?.input;
    expect(ordinaryInput).toEqual([
      expect.objectContaining({ type: "text" })
    ]);
    expect(JSON.stringify(ordinaryInput)).not.toContain("explain-reader-annotations");
    expect(practiceInput).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("$practice-reading-comprehension")
      }),
      {
        type: "skill",
        name: "practice-reading-comprehension",
        path: readingComprehensionSkillPath
      }
    ]);
    expect(JSON.stringify(practiceInput)).not.toContain("explain-reader-annotations");
    expect(explanationInput).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("$explain-reader-annotations")
      }),
      {
        type: "skill",
        name: "explain-reader-annotations",
        path: "/tmp/lingoshelf-codex-test/.agents/skills/explain-reader-annotations/SKILL.md"
      }
    ]);
    controller.close();
  });

  it("merges a partial live allowance update without starting a turn", async () => {
    const { fake, controller } = fixture();
    await controller.connect();

    fake.emitNotification("account/rateLimits/updated", {
      rateLimits: {
        primary: {
          usedPercent: 50,
          windowDurationMins: 300,
          resetsAt: 1_700_000_100
        },
        secondary: null
      }
    });
    await waitUntil(
      () => controller.getSnapshot().allowance.fiveHour?.remainingPercent === 50
    );

    expect(controller.getSnapshot().allowance.weekly?.remainingPercent).toBe(62);
    expect(fake.requests.filter((request) => request.method === "turn/start"))
      .toHaveLength(0);
    controller.close();
  });

  it("distinguishes an unavailable allowance window from a zero-percent window", async () => {
    const { controller } = fixture({
      rateLimitsResult: {
        rateLimits: {
          primary: {
            usedPercent: 100,
            windowDurationMins: 300,
            resetsAt: 1_700_000_000
          },
          secondary: null
        },
        rateLimitsByLimitId: null
      }
    });

    const snapshot = await controller.connect();

    expect(snapshot.allowance.fiveHour?.remainingPercent).toBe(0);
    expect(snapshot.allowance.weekly).toBeNull();
    expect(snapshot.allowance.phase).toBe("available");
    controller.close();
  });

  it("requires authentication when Codex has no current account", async () => {
    const { controller } = fixture({
      accountResult: { account: null, requiresOpenaiAuth: true }
    });

    const snapshot = await controller.connect();

    expect(snapshot.connection).toBe("auth-required");
    expect(snapshot.account).toBeNull();
    await expect(controller.sendMessage({ text: "Hello" }))
      .rejects.toThrow(/登入/);
    controller.close();
  });

  it("reports malformed account responses as a connection failure", async () => {
    const { controller } = fixture({ accountResult: { unexpected: true } });

    const snapshot = await controller.connect();

    expect(snapshot.connection).toBe("error");
    expect(snapshot.connectionDetail).toMatch(/account\/read/);
    controller.close();
  });

  it("rejects a parallel turn even while the first thread is being created", async () => {
    const { fake, controller } = fixture({
      threadStartDelayMs: 30,
      turnDelayMs: 40
    });
    await controller.connect();
    const first = controller.sendMessage({ text: "First" });
    await waitUntil(() => fake.requests.some(
      (request) => request.method === "thread/start"
    ));

    await expect(controller.sendMessage({ text: "Too soon" }))
      .rejects.toThrow(/等待/);
    await first;
    expect(fake.requests.filter((request) => request.method === "turn/start"))
      .toHaveLength(1);
    controller.close();
    expect(fake.killSignals).toEqual(["SIGTERM"]);
  });

  it("creates, switches and resumes isolated global conversations", async () => {
    const { fake, controller } = managedFixture();
    await controller.connect();

    await controller.sendMessage({
      text: "  Explain\nthis sentence in detail  ",
      context: { bookTitle: "A Book", chapterTitle: "Opening" }
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    const firstConversationId = controller.getSnapshot().activeConversationId;

    controller.startNewConversation();
    expect(controller.getSnapshot()).toMatchObject({
      activeConversationId: null,
      threadId: null,
      messages: []
    });
    await controller.sendMessage({ text: "General question" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    expect(controller.getSnapshot().conversations.map((conversation) =>
      conversation.title)).toEqual([
      "General question",
      "Explain this sentence in detail"
    ]);
    controller.selectConversation(String(firstConversationId));
    expect(controller.getSnapshot().messages[0]?.text)
      .toBe("Explain\nthis sentence in detail");

    await controller.sendMessage({
      text: "講解標記內容",
      intent: "explainAnnotations",
      explanationLanguage: "en",
      context: {
        readingSegment: '<reading-segment><reader-annotation id="A1">Continue</reader-annotation></reading-segment>'
      }
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    const resumedRequests = fake.requests.filter(
      (request) => request.method === "thread/resume"
    );
    expect(resumedRequests).toEqual([expect.objectContaining({
      params: expect.objectContaining({ threadId: "thread-1" })
    })]);
    const startedInstructions = fake.requests.find(
      (request) => request.method === "thread/start"
    )?.params?.developerInstructions;
    expect(resumedRequests[0]?.params?.developerInstructions)
      .toBe(startedInstructions);
    expect(String(startedInstructions)).toContain("explain-reader-annotations");
    expect(String(startedInstructions)).toContain("practice-reading-comprehension");
    const resumedTurn = fake.requests.filter(
      (request) => request.method === "turn/start"
    ).at(-1);
    expect(resumedTurn?.params?.threadId).toBe("thread-1");
    expect(resumedTurn?.params?.input).toEqual([
      expect.objectContaining({ type: "text" }),
      expect.objectContaining({
        type: "skill",
        name: "explain-reader-annotations"
      })
    ]);
    controller.close();
  });

  it("restores the last selected conversation and messages from local state", async () => {
    const store = new MemoryChatConversationStore({
      version: 1,
      selectedConversationId: "conversation-b",
      conversations: [{
        id: "conversation-a",
        threadId: "thread-a",
        title: "Older",
        createdAt: 10,
        updatedAt: 20,
        source: null,
        messages: []
      }, {
        id: "conversation-b",
        threadId: "thread-b",
        title: "Latest",
        createdAt: 30,
        updatedAt: 40,
        source: { bookTitle: "Book", chapterTitle: "Chapter" },
        messages: [{
          id: "user-b",
          turnId: "turn-b",
          role: "user",
          text: "Saved question",
          status: "completed"
        }]
      }]
    });

    const { controller } = managedFixture(store);
    expect(controller.getSnapshot()).toMatchObject({
      activeConversationId: "conversation-b",
      threadId: "thread-b",
      messages: [{ text: "Saved question" }]
    });
    expect(controller.getSnapshot().conversations.map(({ id }) => id))
      .toEqual(["conversation-b", "conversation-a"]);
    controller.close();
  });

  it("archives a removed conversation and returns to an unpersisted blank conversation", async () => {
    const { fake, controller, store } = managedFixture();
    await controller.connect();
    await controller.sendMessage({ text: "Remove me" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    const conversationId = String(controller.getSnapshot().activeConversationId);

    await controller.removeConversation(conversationId);

    expect(fake.requests.filter((request) => request.method === "thread/archive"))
      .toEqual([expect.objectContaining({
        params: { threadId: "thread-1" }
      })]);
    expect(controller.getSnapshot()).toMatchObject({
      activeConversationId: null,
      threadId: null,
      messages: [],
      conversations: []
    });
    expect(store.state.conversations).toEqual([]);
    controller.close();
  });

  it("locks conversation management while an answer is active", async () => {
    const store = new MemoryChatConversationStore();
    const fake = createFakeCodexAppServer({ turnDelayMs: 40 });
    const controller = new ChatController({
      createClient: () => new SpawnedCodexAppServerClient({
        spawnProcess: () => fake.child
      }),
      workingDirectory: "/tmp/lingoshelf-codex-test",
      annotationExplanationSkillPath,
      annotationExplanationSkillInstructions,
      readingComprehensionSkillPath,
      readingComprehensionSkillInstructions,
      conversationStore: store
    });
    await controller.connect();
    await controller.sendMessage({ text: "Wait" });

    expect(() => controller.startNewConversation()).toThrow(/等待/);
    expect(() => controller.selectConversation("missing")).toThrow(/等待/);
    await expect(controller.removeConversation("missing")).rejects.toThrow(/等待/);
    controller.close();
  });

  it("shows a blank conversation when the persisted selection no longer exists", () => {
    const store = new MemoryChatConversationStore({
      version: 1,
      selectedConversationId: "missing",
      conversations: [{
        id: "available",
        threadId: "thread-a",
        title: "Available",
        createdAt: 10,
        updatedAt: 20,
        source: null,
        messages: []
      }]
    });

    const { controller } = managedFixture(store);
    expect(controller.getSnapshot()).toMatchObject({
      activeConversationId: null,
      threadId: null,
      messages: []
    });
    expect(controller.getSnapshot().conversations).toHaveLength(1);
    controller.close();
  });

  it("keeps saved messages visible and does not create a replacement thread when resume fails", async () => {
    const store = new MemoryChatConversationStore({
      version: 1,
      selectedConversationId: "saved",
      conversations: [{
        id: "saved",
        threadId: "missing-thread",
        title: "Saved",
        createdAt: 10,
        updatedAt: 20,
        source: null,
        messages: [{
          id: "user-saved",
          turnId: "turn-saved",
          role: "user",
          text: "Saved question",
          status: "completed"
        }]
      }]
    });
    const fake = createFakeCodexAppServer({ resumeError: "thread missing" });
    const controller = new ChatController({
      createClient: () => new SpawnedCodexAppServerClient({
        spawnProcess: () => fake.child
      }),
      workingDirectory: "/tmp/lingoshelf-codex-test",
      annotationExplanationSkillPath,
      annotationExplanationSkillInstructions,
      readingComprehensionSkillPath,
      readingComprehensionSkillInstructions,
      conversationStore: store
    });
    await controller.connect();

    await expect(controller.sendMessage({ text: "Continue" }))
      .rejects.toThrow(/thread missing/);
    expect(controller.getSnapshot().messages.map(({ text }) => text))
      .toEqual(["Saved question"]);
    expect(fake.requests.filter((request) => request.method === "thread/start"))
      .toHaveLength(0);
    controller.close();
  });

  it("keeps a conversation when Codex refuses to archive its thread", async () => {
    const store = new MemoryChatConversationStore();
    const fake = createFakeCodexAppServer({ archiveError: "archive failed" });
    const controller = new ChatController({
      createClient: () => new SpawnedCodexAppServerClient({
        spawnProcess: () => fake.child
      }),
      workingDirectory: "/tmp/lingoshelf-codex-test",
      annotationExplanationSkillPath,
      annotationExplanationSkillInstructions,
      readingComprehensionSkillPath,
      readingComprehensionSkillInstructions,
      conversationStore: store,
      createConversationId: () => "conversation-a"
    });
    await controller.connect();
    await controller.sendMessage({ text: "Keep me" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    await expect(controller.removeConversation("conversation-a"))
      .rejects.toThrow(/archive failed/);
    expect(controller.getSnapshot().conversations.map(({ id }) => id))
      .toEqual(["conversation-a"]);
    expect(store.state.conversations.map(({ id }) => id))
      .toEqual(["conversation-a"]);
    controller.close();
  });

  it("unarchives and restores a conversation when local removal cannot be saved", async () => {
    const store = new FailingSaveConversationStore();
    const fake = createFakeCodexAppServer();
    const controller = new ChatController({
      createClient: () => new SpawnedCodexAppServerClient({
        spawnProcess: () => fake.child
      }),
      workingDirectory: "/tmp/lingoshelf-codex-test",
      annotationExplanationSkillPath,
      annotationExplanationSkillInstructions,
      readingComprehensionSkillPath,
      readingComprehensionSkillInstructions,
      conversationStore: store,
      createConversationId: () => "conversation-a"
    });
    await controller.connect();
    await controller.sendMessage({ text: "Keep me locally" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    store.failSave = true;

    await expect(controller.removeConversation("conversation-a"))
      .rejects.toThrow(/disk full/);
    expect(fake.requests.filter((request) => request.method === "thread/unarchive"))
      .toHaveLength(1);
    expect(controller.getSnapshot().conversations.map(({ id }) => id))
      .toEqual(["conversation-a"]);
    controller.close();
  });
});

describe("composeCodexInput", () => {
  it("uses only the explicitly provided reading segment and falls back to the question", () => {
    expect(composeCodexInput({
      text: "Explain it",
      context: {
        bookTitle: "Book",
        chapterTitle: "Chapter",
        readingSegment: "inside range"
      }
    })).toContain("inside range");
    expect(composeCodexInput({
      text: "Updated context",
      context: { readingSegment: "<reading-segment>No marks.</reading-segment>" }
    })).toContain("取代這段 AI 對話先前的閱讀區段與標記上下文");
    expect(composeCodexInput({ text: "General question" }))
      .toBe("General question");
  });

  it("keeps inline annotations as ordinary context without forcing analysis", () => {
    const result = composeCodexInput({
      text: "What happened next?",
      context: {
        readingSegment: '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation>.</reading-segment>'
      }
    });

    expect(result).toContain('<reader-annotation id="A1">reluctant</reader-annotation>');
    expect(result).not.toContain("單字、片語、句子");
    expect(result).not.toContain("講解標記內容");
  });

  it.each([
    ["source", "Use the same language as the current reading segment"],
    ["zh-TW", "Traditional Chinese"],
    ["en", "English"],
    ["ja", "Japanese"]
  ] as const)("passes the %s explanation language to the annotation skill", (
    explanationLanguage,
    expectedLanguage
  ) => {
    const result = composeCodexInput({
      text: "講解標記內容",
      intent: "explainAnnotations",
      explanationLanguage,
      context: {
        bookTitle: "Book",
        chapterTitle: "Chapter",
        readingSegment: '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation>.</reading-segment>'
      }
    });

    expect(result).toContain("$explain-reader-annotations");
    expect(result).toContain(`Explanation language: ${expectedLanguage}`);
    expect(result).not.toContain("區段解析規則");
  });

  it.each([
    ["source", "Use the same language as the current reading segment"],
    ["zh-TW", "Traditional Chinese"],
    ["en", "English"],
    ["ja", "Japanese"]
  ] as const)("uses %s for both the reading quiz and open-ended answers", (
    explanationLanguage,
    expectedLanguage
  ) => {
    const result = composeCodexInput({
      text: "開始閱讀測驗",
      intent: "practiceReading",
      explanationLanguage,
      context: {
        readingSegment: "<reading-segment>這是一段中文文章。</reading-segment>"
      }
    });

    expect(result).toContain(`Quiz language: ${expectedLanguage}`);
    expect(result).toContain(
      `Answer language for open-ended questions: ${expectedLanguage}`
    );
    expect(result).toContain("$practice-reading-comprehension");
    expect(result).toContain("Do not impose a sentence-count requirement");
  });

  it("asks for a no-annotation response and supports source language", () => {
    const result = composeCodexInput({
      text: "講解標記內容",
      intent: "explainAnnotations",
      explanationLanguage: "source",
      context: { readingSegment: "<reading-segment>No marks.</reading-segment>" }
    });

    expect(result).toContain("The current reading segment contains no reader annotations");
    expect(result).toContain("Use the same language as the current reading segment");
  });

  it("delegates the adaptive quiz and grading workflow to the reading skill", () => {
    const words = Array.from({ length: 301 }, () => "word").join(" ");
    const result = composeCodexInput({
      text: "開始閱讀測驗",
      intent: "practiceReading",
      context: {
        readingSegment: `<reading-segment>${words}</reading-segment>`
      }
    });

    expect(result).toContain("$practice-reading-comprehension");
    expect(result).toContain("Quiz language:");
    expect(result).toContain(
      "Answer language for open-ended questions: Use the same language as the current reading segment"
    );
    expect(result).toContain("Do not use or infer content outside");
    expect(result).not.toContain("exactly 4");
    expect(result).not.toContain("3 to 10");
  });
});

describe("explain-reader-annotations skill", () => {
  it("defines selective learner sections, contextual CEFR levels and a localized review table", () => {
    const skill = annotationExplanationSkillInstructions;

    expect(skill).toContain("Select only the sections that improve understanding");
    expect(skill).toContain("Judge the item as used in this passage, not in isolation");
    expect(skill).toContain("Marked item | Simple meaning | CEFR level | Useful note");
    expect(skill).toContain("Use the requested explanation language for headings");
    expect(skill).toContain("Do not include every section mechanically");
  });
});
