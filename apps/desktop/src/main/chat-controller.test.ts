import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ChatController,
  composeCodexInput
} from "./chat-controller";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import type {
  ChatConversationStore,
  StoredChatState
} from "./chat-conversation-store";
import type {
  CreateLearningItemInput,
  LearningItem,
  LearningItemDraft
} from "../shared/learning-contracts";
import type { LearningItemRecheckDecision } from "./learning-item-artifacts";
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
const learningItemCreationSkillPath =
  "/tmp/lingoshelf-codex-test/.agents/skills/create-learning-items/SKILL.md";
const learningItemCreationSkillInstructions = readFileSync(resolve(
  process.cwd(),
  "../../.agents/skills/create-learning-items/SKILL.md"
), "utf8");
const bankCandidate = {
  id: "item-bank-finance",
  title: "bank",
  itemType: "word" as const,
  cefr: "A2" as const,
  sense: "financial institution",
  markdownContent: "## Meaning\n銀行",
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  trashedAt: null
};

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
    readingComprehensionSkillInstructions,
    learningItemCreationSkillPath,
    learningItemCreationSkillInstructions,
    findLearningItemCandidates: async (titles: string[]) =>
      titles.includes("bank") ? [bankCandidate] : []
  });
  return { fake, controller };
}

function managedFixture(
  store = new MemoryChatConversationStore(),
  options: Parameters<typeof createFakeCodexAppServer>[0] = {},
  learningOptions: {
    findLearningItemCandidates?(titles: string[]): Promise<LearningItem[]>;
    createLearningItemsAtomically?(
      inputs: CreateLearningItemInput[]
    ): Promise<LearningItem[]>;
    restoreLearningItem?(itemId: string): Promise<LearningItem>;
    classifyLearningItemDuplicates?(
      drafts: LearningItemDraft[],
      candidates: LearningItem[]
    ): Promise<LearningItemRecheckDecision[]>;
  } = {}
) {
  const fake = createFakeCodexAppServer(options);
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
    learningItemCreationSkillPath,
    learningItemCreationSkillInstructions,
    findLearningItemCandidates: learningOptions.findLearningItemCandidates ??
      (async (titles: string[]) =>
        titles.includes("bank") ? [bankCandidate] : []),
    createLearningItemsAtomically: learningOptions.createLearningItemsAtomically,
    restoreLearningItem: learningOptions.restoreLearningItem,
    classifyLearningItemDuplicates:
      learningOptions.classifyLearningItemDuplicates,
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
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({
      text: "新增 bank 的河岸語義",
      intent: "createLearningItems",
      explanationLanguage: "zh-TW",
      learningItemTargets: [{
        title: "bank",
        senseHint: "side of a river"
      }]
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
    expect(loadedInstructions).toContain("create-learning-items");
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
    expect(loadedInstructions.match(/<app-provided-skill /g)).toHaveLength(3);
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
    const creationInput = turnStarts[3]?.params?.input;
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
    expect(creationInput).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("$create-learning-items")
      }),
      {
        type: "skill",
        name: "create-learning-items",
        path: learningItemCreationSkillPath
      }
    ]);
    expect(JSON.stringify(creationInput)).toContain("financial institution");
    expect(JSON.stringify(creationInput)).not.toContain("happy");
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

  it("attaches a validated learning-item batch to the completed AI message and store", async () => {
    const answer = [
      "已整理完成，請確認。",
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "reluctant",
          itemType: "word",
          cefr: "B2",
          sense: "unwilling or hesitant",
          markdownContent: "## Meaning\n不情願。\n\n## Examples\n1. She was reluctant."
        }],
        existing: [],
        trashed: []
      }),
      "```"
    ].join("\n");
    const store = new MemoryChatConversationStore();
    const { controller } = managedFixture(store, { answer });
    await controller.connect();

    await controller.sendMessage({
      text: "新增 reluctant",
      intent: "createLearningItems",
      explanationLanguage: "zh-TW",
      learningItemTargets: [{ title: "reluctant" }]
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    const assistant = controller.getSnapshot().messages.find(
      (message) => message.role === "assistant"
    );
    expect(assistant?.text).toBe("已整理完成，請確認。");
    expect(assistant?.learningItemBatch).toMatchObject({
      status: "pending",
      drafts: [{
        title: "reluctant",
        state: "included"
      }]
    });
    expect(store.state.conversations[0]?.messages[1]?.learningItemBatch)
      .toEqual(assistant?.learningItemBatch);
    controller.close();
  });

  it("rejects learning-item matches that exact-title lookup did not supply", async () => {
    const answer = [
      "Already exists.",
      "```learning-item-result",
      JSON.stringify({
        drafts: [],
        existing: [{
          itemId: "forged-item",
          title: "bank",
          sense: "financial institution",
          status: "active"
        }],
        trashed: []
      }),
      "```"
    ].join("\n");
    const { controller } = fixture({ answer });
    await controller.connect();
    await controller.sendMessage({
      text: "Add bank",
      intent: "createLearningItems",
      learningItemTargets: [{ title: "bank" }]
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    const assistant = controller.getSnapshot().messages.find(
      (message) => message.role === "assistant"
    );
    expect(assistant?.learningItemBatch).toBeUndefined();
    expect(assistant?.artifactError).toMatch(/候選/);
    controller.close();
  });

  it("continues a persisted creation clarification and queries candidates for the answer", async () => {
    const answer = (prompt: string) => prompt.includes(
      "Requested learning-item targets: []"
    )
      ? "What word or phrase would you like to add?"
      : [
          "This sense already exists.",
          "```learning-item-result",
          JSON.stringify({
            drafts: [],
            existing: [{
              itemId: "item-bank-finance",
              title: "bank",
              sense: "financial institution",
              status: "active"
            }],
            trashed: []
          }),
          "```"
        ].join("\n");
    const store = new MemoryChatConversationStore();
    const first = managedFixture(store, {
      answer
    });
    await first.controller.connect();
    await first.controller.sendMessage({
      text: "Add learning cards",
      intent: "createLearningItems",
      learningItemTargets: []
    });
    await waitUntil(() => first.controller.getSnapshot().activeTurnId === null);
    first.controller.close();

    const { fake, controller } = managedFixture(store, {
      answer: (prompt) => prompt.includes(
        "Requested learning-item targets: []"
      )
        ? "What word or phrase would you like to add?"
        : answer(prompt)
    });
    await controller.connect();
    await controller.sendMessage({ text: "bank" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    const secondTurn = fake.requests
      .find((request) => request.method === "turn/start");
    const secondInput = (
      secondTurn?.params?.input as Array<{ text?: string }> | undefined
    )?.[0]?.text;
    expect(secondInput).toContain(
      'Requested learning-item targets: [{"title":"bank"}].'
    );
    expect(secondInput).toContain("item-bank-finance");
    expect(controller.getSnapshot().messages.findLast(
      (message) => message.role === "assistant"
    )?.learningItemBatch)
      .toMatchObject({
        existing: [{ itemId: "item-bank-finance" }]
      });
    expect(controller.getSnapshot().messages.findLast(
      (message) => message.role === "user"
    )?.learningItemRequest)
      .toEqual({ targets: [{ title: "bank" }] });
    controller.close();
  });

  it("uses structured targets from a clarification before interpreting a contextual answer", async () => {
    const answer = (prompt: string) => {
      if (prompt.includes("Requested learning-item targets: [].")) {
        return [
          "要把 `apple` 和 `banana` 都新增為學習卡片嗎？",
          "```learning-item-request",
          JSON.stringify({
            targets: [{ title: "apple" }, { title: "banana" }]
          }),
          "```"
        ].join("\n");
      }
      if (prompt.includes('"title":"apple"') &&
        prompt.includes('"title":"banana"')) {
        return [
          "已準備兩張草稿。",
          "```learning-item-result",
          JSON.stringify({
            drafts: [{
              title: "apple",
              itemType: "word",
              cefr: "A1",
              sense: "a round fruit",
              markdownContent: "## Meaning\nA round fruit."
            }, {
              title: "banana",
              itemType: "word",
              cefr: "A1",
              sense: "a long curved fruit",
              markdownContent: "## Meaning\nA long curved fruit."
            }],
            existing: [],
            trashed: []
          }),
          "```"
        ].join("\n");
      }
      return "「apple」是蘋果，「banana」是香蕉。";
    };
    const candidateQueries: string[][] = [];
    const { controller } = managedFixture(
      new MemoryChatConversationStore(),
      { answer },
      {
        findLearningItemCandidates: async (titles) => {
          candidateQueries.push(titles);
          return [];
        }
      }
    );
    await controller.connect();

    await controller.sendMessage({ text: "apple banana" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({
      text: "新增學習卡片",
      intent: "createLearningItems",
      learningItemTargets: []
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({ text: "都加" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    expect(candidateQueries).toContainEqual(["apple", "banana"]);
    const assistant = controller.getSnapshot().messages.findLast(
      (message) => message.role === "assistant"
    );
    expect(assistant?.artifactError).toBeUndefined();
    expect(assistant?.learningItemBatch?.drafts.map(({ title }) => title))
      .toEqual(["apple", "banana"]);
    expect(controller.getSnapshot().messages.findLast(
      (message) => message.role === "user"
    )?.learningItemRequest?.targets)
      .toEqual([
        { title: "apple", senseHint: "都加" },
        { title: "banana", senseHint: "都加" }
      ]);
    controller.close();
  });

  it("uses the last completed assistant clarification when a turn produced multiple messages", async () => {
    const store = new MemoryChatConversationStore({
      version: 2,
      selectedConversationId: "conversation-a",
      conversations: [{
        id: "conversation-a",
        threadId: "thread-a",
        title: "Add cards",
        createdAt: 10,
        updatedAt: 20,
        source: null,
        messages: [{
          id: "user-a",
          turnId: "turn-a",
          role: "user",
          text: "新增學習卡片",
          status: "completed",
          learningItemRequest: { targets: [] }
        }, {
          id: "assistant-a",
          turnId: "turn-a",
          role: "assistant",
          text: "目前還沒有直接提供目標。",
          status: "completed"
        }, {
          id: "assistant-b",
          turnId: "turn-a",
          role: "assistant",
          text: "要把 apple 和 banana 都加入嗎？",
          status: "completed",
          learningItemRequest: {
            targets: [{ title: "apple" }, { title: "banana" }]
          }
        }]
      }]
    });
    const candidateQueries: string[][] = [];
    const { controller } = managedFixture(
      store,
      {
        answer: [
          "已準備兩張草稿。",
          "```learning-item-result",
          JSON.stringify({
            drafts: [{
              title: "apple",
              itemType: "word",
              cefr: "A1",
              sense: "a round fruit",
              markdownContent: "## Meaning\nA round fruit."
            }, {
              title: "banana",
              itemType: "word",
              cefr: "A1",
              sense: "a long curved fruit",
              markdownContent: "## Meaning\nA long curved fruit."
            }],
            existing: [],
            trashed: []
          }),
          "```"
        ].join("\n")
      },
      {
        findLearningItemCandidates: async (titles) => {
          candidateQueries.push(titles);
          return [];
        }
      }
    );
    await controller.connect();

    await controller.sendMessage({ text: "都加" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    expect(candidateQueries).toEqual([["apple", "banana"]]);
    expect(controller.getSnapshot().messages.findLast(
      (message) => message.role === "assistant"
    )?.learningItemBatch?.drafts.map(({ title }) => title))
      .toEqual(["apple", "banana"]);
    controller.close();
  });

  it("keeps a known target and appends the user's sense clarification", async () => {
    const store = new MemoryChatConversationStore({
      version: 2,
      selectedConversationId: "conversation-a",
      conversations: [{
        id: "conversation-a",
        threadId: "thread-a",
        title: "Add bank",
        createdAt: 10,
        updatedAt: 20,
        source: null,
        messages: [{
          id: "user-a",
          turnId: "turn-a",
          role: "user",
          text: "新增 bank",
          status: "completed",
          learningItemRequest: {
            targets: [{ title: "bank" }]
          }
        }, {
          id: "assistant-a",
          turnId: "turn-a",
          role: "assistant",
          text: "你指的是哪一個語義？",
          status: "completed"
        }]
      }]
    });
    const candidateQueries: string[][] = [];
    const { controller } = managedFixture(
      store,
      { answer: "了解，我會使用河岸語義。" },
      {
        findLearningItemCandidates: async (titles) => {
          candidateQueries.push(titles);
          return [];
        }
      }
    );
    await controller.connect();

    await controller.sendMessage({ text: "河岸的意思" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    expect(candidateQueries).toEqual([["bank"]]);
    expect(controller.getSnapshot().messages.findLast(
      (message) => message.role === "user"
    )?.learningItemRequest?.targets)
      .toEqual([{ title: "bank", senseHint: "河岸的意思" }]);
    controller.close();
  });

  it("edits, excludes, restores and transactionally submits a pending learning-item batch once", async () => {
    const store = new MemoryChatConversationStore({
      version: 2,
      selectedConversationId: "conversation-a",
      conversations: [{
        id: "conversation-a",
        threadId: "thread-a",
        title: "Add cards",
        createdAt: 10,
        updatedAt: 20,
        source: null,
        messages: [{
          id: "assistant-a",
          turnId: "turn-a",
          role: "assistant",
          text: "Ready",
          status: "completed",
          learningItemBatch: {
            id: "batch-a",
            status: "pending",
            drafts: [{
              id: "draft-bank",
              title: "bank",
              itemType: "word",
              cefr: "A2",
              sense: "an organization that keeps and lends money",
              markdownContent: "## Meaning\n銀行",
              state: "included"
            }, {
              id: "draft-reluctant",
              title: "reluctant",
              itemType: "word",
              cefr: "B2",
              sense: "unwilling or hesitant",
              markdownContent: "## Meaning\n不情願。",
              state: "included"
            }],
            existing: [],
            trashed: []
          }
        }]
      }]
    });
    const created = {
      ...bankCandidate,
      id: "created-reluctant",
      title: "reluctant",
      cefr: "C1" as const,
      sense: "unwilling or hesitant",
      markdownContent: "## Meaning\n不願意。"
    };
    const submittedInputs: unknown[] = [];
    const classifyLearningItemDuplicates = vi.fn().mockResolvedValue([{
      draftId: "draft-bank",
      decision: "existing",
      itemId: "item-bank-finance"
    }, {
      draftId: "draft-reluctant",
      decision: "create"
    }]);
    const { controller } = managedFixture(store, {}, {
      findLearningItemCandidates: async () => [bankCandidate],
      classifyLearningItemDuplicates,
      createLearningItemsAtomically: async (inputs) => {
        submittedInputs.push(...inputs);
        return [created];
      }
    });

    controller.updateLearningItemDraft({
      batchId: "batch-a",
      draftId: "draft-reluctant",
      title: "reluctant",
      itemType: "word",
      cefr: "C1",
      sense: "unwilling or hesitant",
      markdownContent: "## Meaning\n不願意。"
    });
    controller.setLearningItemDraftState(
      "batch-a",
      "draft-reluctant",
      "excluded"
    );
    controller.setLearningItemDraftState(
      "batch-a",
      "draft-reluctant",
      "included"
    );
    const submitted = await controller.submitLearningItemBatch("batch-a");

    expect(classifyLearningItemDuplicates).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "draft-bank",
          sense: "an organization that keeps and lends money"
        })
      ]),
      [bankCandidate]
    );
    expect(submittedInputs).toEqual([expect.objectContaining({
      title: "reluctant",
      cefr: "C1"
    })]);
    expect(submitted.messages[0]?.learningItemBatch).toMatchObject({
      status: "submitted",
      createdItemIds: ["created-reluctant"],
      existing: [{
        itemId: "item-bank-finance",
        title: "bank",
        status: "active"
      }]
    });
    expect(store.state.conversations[0]?.messages[0]?.learningItemBatch)
      .toEqual(submitted.messages[0]?.learningItemBatch);
    await expect(controller.submitLearningItemBatch("batch-a"))
      .rejects.toThrow(/已提交/);
    controller.close();
  });

  it("restores a trashed duplicate through the batch and persists the updated match", async () => {
    const trashedCandidate = {
      ...bankCandidate,
      id: "item-happy",
      title: "happy",
      sense: "feeling pleasure",
      status: "trashed" as const,
      trashedAt: "2026-01-02T00:00:00.000Z"
    };
    const store = new MemoryChatConversationStore({
      version: 2,
      selectedConversationId: "conversation-a",
      conversations: [{
        id: "conversation-a",
        threadId: "thread-a",
        title: "Restore card",
        createdAt: 10,
        updatedAt: 20,
        source: null,
        messages: [{
          id: "assistant-a",
          turnId: "turn-a",
          role: "assistant",
          text: "Found in trash",
          status: "completed",
          learningItemBatch: {
            id: "batch-trash",
            status: "submitted",
            submittedAt: 30,
            createdItemIds: [],
            drafts: [],
            existing: [],
            trashed: [{
              itemId: "item-happy",
              title: "happy",
              sense: "feeling pleasure",
              status: "trashed"
            }]
          }
        }]
      }]
    });
    const { controller } = managedFixture(store, {}, {
      restoreLearningItem: async () => ({
        ...trashedCandidate,
        status: "active",
        trashedAt: null
      })
    });

    const restored = await controller.restoreLearningItemMatch(
      "batch-trash",
      "item-happy"
    );

    expect(restored.messages[0]?.learningItemBatch).toMatchObject({
      existing: [{
        itemId: "item-happy",
        status: "active"
      }],
      trashed: []
    });
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

  it("uses each learning-item target language when the card setting is source", () => {
    const result = composeCodexInput({
      text: "新增學習卡片",
      intent: "createLearningItems",
      explanationLanguage: "source",
      learningItemTargets: [
        { title: "reluctant" },
        { title: "躊躇" },
        { title: "ためらう" }
      ],
      context: {
        readingSegment: "<reading-segment>這是一段中文內容。</reading-segment>"
      }
    });

    expect(result).toContain(
      "For each learning item, use the language of that requested target title"
    );
    expect(result).toContain("English targets use English");
    expect(result).toContain(
      "Traditional Chinese targets use Traditional Chinese"
    );
    expect(result).toContain("Japanese targets use Japanese");
    expect(result).toContain(
      "A mixed-language batch may use a different explanation language for each card"
    );
    expect(result).not.toContain(
      "Explanation language: Use the same language as the current reading segment"
    );
  });

  it.each([
    ["zh-TW", "Traditional Chinese"],
    ["en", "English"],
    ["ja", "Japanese"]
  ] as const)("uses fixed %s for every learning card", (
    explanationLanguage,
    expectedLanguage
  ) => {
    const result = composeCodexInput({
      text: "新增學習卡片",
      intent: "createLearningItems",
      explanationLanguage,
      learningItemTargets: [
        { title: "reluctant" },
        { title: "ためらう" }
      ]
    });

    expect(result).toContain(
      `Explanation language for every learning item: ${expectedLanguage}`
    );
    expect(result).not.toContain(
      "use the language of that requested target title"
    );
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

describe("create-learning-items skill", () => {
  it("defines per-target source language and fixed-language batch behavior", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain(
      "infer the explanation language separately from each requested target title"
    );
    expect(skill).toContain(
      "English targets use English, Traditional Chinese targets use Traditional Chinese, and Japanese targets use Japanese"
    );
    expect(skill).toContain(
      "When the App requests a fixed language, use that language for every draft in the batch"
    );
    expect(skill).toContain(
      "Keep `sense` as a short English semantic identifier"
    );
  });

  it("returns structured targets whenever it asks a creation clarification", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain(
      "End every clarification response with exactly one fenced `learning-item-request`"
    );
    expect(skill).toContain(
      "contextual answer itself as a new card title"
    );
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
    expect(skill).toContain(
      "give 3–5 distinct, natural, complete example sentences"
    );
    expect(skill).toContain("Never provide only 1 or 2 examples");
    expect(skill).toContain(
      "Before finalizing, count the sentences in every Examples section"
    );
    expect(skill).toContain("whether to add all explained words and phrases");
    expect(skill).toContain("learning-item-invitation");
    expect(skill).toContain("Do not include sentence annotations");
    expect(skill).not.toContain("give 2–3 natural examples");
  });
});
