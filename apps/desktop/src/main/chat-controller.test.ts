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
  "/tmp/vocabreader-codex-test/.agents/skills/explain-reader-annotations/SKILL.md";
const annotationExplanationSkillInstructions = readFileSync(resolve(
  process.cwd(),
  "../../.agents/skills/explain-reader-annotations/SKILL.md"
), "utf8");
const readingComprehensionSkillPath =
  "/tmp/vocabreader-codex-test/.agents/skills/practice-reading-comprehension/SKILL.md";
const readingComprehensionSkillInstructions = [
  "name: practice-reading-comprehension",
  "Estimate the passage CEFR level.",
  "Create 8 to 12 multiple-choice questions.",
  "Provide a final review after grading."
].join("\n");
const segmentRetellingSkillPath =
  "/tmp/vocabreader-codex-test/.agents/skills/practice-segment-retelling/SKILL.md";
const segmentRetellingSkillInstructions = [
  "name: practice-segment-retelling",
  "Use the dominant language of the reading segment.",
  "Foundational revision and Next-step revision."
].join("\n");
const learningItemCreationSkillPath =
  "/tmp/vocabreader-codex-test/.agents/skills/create-learning-items/SKILL.md";
const learningItemCreationSkillInstructions = readFileSync(resolve(
  process.cwd(),
  "../../.agents/skills/create-learning-items/SKILL.md"
), "utf8");
const bankCandidate = {
  id: "item-bank-finance",
  title: "bank",
  itemType: "word" as const,
      language: "en" as const,
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
    workingDirectory: "/tmp/vocabreader-codex-test",
    annotationExplanationSkillPath,
    annotationExplanationSkillInstructions,
    readingComprehensionSkillPath,
    readingComprehensionSkillInstructions,
    segmentRetellingSkillPath,
    segmentRetellingSkillInstructions,
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
    workingDirectory: "/tmp/vocabreader-codex-test",
    annotationExplanationSkillPath,
    annotationExplanationSkillInstructions,
    readingComprehensionSkillPath,
    readingComprehensionSkillInstructions,
    segmentRetellingSkillPath,
    segmentRetellingSkillInstructions,
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
    if (Date.now() > deadline) throw new Error("Wait fake Codex 回應逾時。");
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
    expect(fake.requests[0]?.params?.clientInfo).toEqual({
      name: "vocabreader",
      title: "VocabReader",
      version: "0.1.0"
    });
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

  it("keeps only the last final answer when one turn retries with new message items", async () => {
    const store = new MemoryChatConversationStore();
    const { controller } = managedFixture(store, {
      agentMessages: [{
        text: "First incomplete explanation",
        phase: "final_answer"
      }, {
        text: "Second incomplete explanation",
        phase: "final_answer"
      }, {
        text: "Complete final explanation",
        phase: "final_answer"
      }]
    });
    const assistantCounts: number[] = [];
    const unsubscribe = controller.onStateChanged((snapshot) => {
      assistantCounts.push(snapshot.messages.filter(
        (message) => message.role === "assistant"
      ).length);
    });
    await controller.connect();

    await controller.sendMessage({ text: "Explain annotations" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    const assistantMessages = controller.getSnapshot().messages.filter(
      (message) => message.role === "assistant"
    );
    expect(assistantMessages).toEqual([
      expect.objectContaining({
        text: "Complete final explanation",
        status: "completed"
      })
    ]);
    expect(store.state.conversations[0]?.messages.filter(
      (message) => message.role === "assistant"
    )).toEqual(assistantMessages);
    expect(Math.max(...assistantCounts)).toBe(1);
    unsubscribe();
    controller.close();
  });

  it("does not parse learning artifacts from commentary before the final answer", async () => {
    const commentary = [
      "Preparing an interim explanation.",
      "```learning-item-invitation",
      JSON.stringify({ targets: [{ title: "interim" }] }),
      "```"
    ].join("\n");
    const finalAnswer = [
      "Final explanation.",
      "```learning-item-invitation",
      JSON.stringify({ targets: [{ title: "final" }] }),
      "```"
    ].join("\n");
    const { controller } = managedFixture(
      new MemoryChatConversationStore(),
      {
        agentMessages: [{
          text: commentary,
          phase: "commentary"
        }, {
          text: finalAnswer,
          phase: "final_answer"
        }],
        agentMessageDelayMs: 30
      }
    );
    await controller.connect();

    await controller.sendMessage({ text: "Explain annotations" });
    await waitUntil(() => controller.getSnapshot().messages.some(
      (message) => message.role === "assistant" &&
        message.text === commentary
    ));

    const interim = controller.getSnapshot().messages.find(
      (message) => message.role === "assistant"
    );
    expect(interim?.learningItemInvitation).toBeUndefined();

    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    expect(controller.getSnapshot().messages.filter(
      (message) => message.role === "assistant"
    )).toEqual([
      expect.objectContaining({
        text: "Final explanation.",
        learningItemInvitation: {
          targets: [{ title: "final" }]
        }
      })
    ]);
    controller.close();
  });

  it("keeps a completed agent response when the app server omits its phase", async () => {
    const store = new MemoryChatConversationStore();
    const { controller } = managedFixture(store, {
      agentMessages: [{ text: "Legacy-compatible answer" }]
    });
    await controller.connect();

    await controller.sendMessage({ text: "Explain this" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    expect(controller.getSnapshot().messages.filter(
      (message) => message.role === "assistant"
    )).toEqual([
      expect.objectContaining({ text: "Legacy-compatible answer" })
    ]);
    expect(store.state.conversations[0]?.messages.some(
      (message) => message.role === "assistant" &&
        message.text === "Legacy-compatible answer"
    )).toBe(true);
    controller.close();
  });

  it("injects only the matching App skill for each preset action", async () => {
    const { fake, controller } = fixture();
    await controller.connect();

    await controller.sendMessage({ text: "What does this mean?" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({
      text: "Start reading測驗",
      intent: "practiceReading",
      context: {
        readingSegment: "<reading-segment>A short passage.</reading-segment>"
      }
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({
      text: "Start retelling practice",
      intent: "practiceRetelling",
      explanationLanguage: "zh-TW",
      context: {
        readingSegment: "<reading-segment>A short passage.</reading-segment>"
      }
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);
    await controller.sendMessage({
      text: "Explain annotations",
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
    expect(loadedInstructions).toContain("practice-segment-retelling");
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
    expect(loadedInstructions.match(/<app-provided-skill /g)).toHaveLength(4);
    expect(loadedInstructions).not.toContain("Available skills:");
    expect(threadStart?.params?.config).toMatchObject({
      "skills.include_instructions": false,
      "skills.bundled.enabled": false,
      "features.plugins": false,
      "features.apps": false
    });
    const ordinaryInput = turnStarts[0]?.params?.input;
    const practiceInput = turnStarts[1]?.params?.input;
    const retellingInput = turnStarts[2]?.params?.input;
    const explanationInput = turnStarts[3]?.params?.input;
    const creationInput = turnStarts[4]?.params?.input;
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
    expect(retellingInput).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("$practice-segment-retelling")
      }),
      {
        type: "skill",
        name: "practice-segment-retelling",
        path: segmentRetellingSkillPath
      }
    ]);
    expect(explanationInput).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("$explain-reader-annotations")
      }),
      {
        type: "skill",
        name: "explain-reader-annotations",
        path: "/tmp/vocabreader-codex-test/.agents/skills/explain-reader-annotations/SKILL.md"
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

  it("refreshes the account allowance every minute and stops after close", async () => {
    vi.useFakeTimers();
    try {
      const { fake, controller } = fixture({
        rateLimitsResult: (readCount: number) => {
          if (readCount === 2) return new Error("temporary allowance failure");
          return {
            rateLimits: {
              primary: {
                usedPercent: readCount === 1 ? 28 : readCount === 3 ? 33 : 34,
                windowDurationMins: 10_080,
                resetsAt: 1_800_000_000
              },
              secondary: null
            },
            rateLimitsByLimitId: null
          };
        }
      });
      await controller.connect();
      expect(controller.getSnapshot().allowance.weekly?.remainingPercent)
        .toBe(72);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(fake.requests.filter(
        (request) => request.method === "account/rateLimits/read"
      )).toHaveLength(2);
      expect(controller.getSnapshot().allowance.weekly?.remainingPercent)
        .toBe(72);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(fake.requests.filter(
        (request) => request.method === "account/rateLimits/read"
      )).toHaveLength(3);
      expect(controller.getSnapshot().allowance.weekly?.remainingPercent)
        .toBe(67);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(fake.requests.filter(
        (request) => request.method === "account/rateLimits/read"
      )).toHaveLength(4);
      expect(controller.getSnapshot().allowance.weekly?.remainingPercent)
        .toBe(66);

      controller.close();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fake.requests.filter(
        (request) => request.method === "account/rateLimits/read"
      )).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
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
      .rejects.toThrow(/Sign in/);
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
      .rejects.toThrow(/Wait/);
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
      text: "Explain annotations",
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

  it("keeps only the ten most recently updated conversations when creating an eleventh", async () => {
    const store = new MemoryChatConversationStore({
      version: 2,
      selectedConversationId: null,
      conversations: Array.from({ length: 10 }, (_, index) => ({
        id: `old-conversation-${index + 1}`,
        threadId: `old-thread-${index + 1}`,
        title: `Old conversation ${index + 1}`,
        createdAt: index + 1,
        updatedAt: index + 1,
        source: null,
        messages: []
      }))
    });
    const { controller } = managedFixture(store);
    await controller.connect();

    await controller.sendMessage({ text: "Newest conversation" });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    const snapshot = controller.getSnapshot();
    expect(snapshot.conversations).toHaveLength(10);
    expect(snapshot.conversations.map(({ id }) => id))
      .not.toContain("old-conversation-1");
    expect(snapshot.activeConversationId).toBe("conversation-1");
    expect(snapshot.messages).toHaveLength(2);
    expect(store.state.conversations).toHaveLength(10);
    expect(store.state.conversations.map(({ id }) => id))
      .not.toContain("old-conversation-1");
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
      language: "en" as const,
          cefr: "B2",
          sense: "unwilling or hesitant",
          memoryTip: "想像門已打開，但你的腳還黏在地上。",
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

  it("accepts a canonical title mapping and rechecks that title before submission", async () => {
    const answer = [
      "Draft ready.",
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "dog",
          requestedTitles: ["dogs"],
          itemType: "word",
      language: "en" as const,
          cefr: "A1",
          sense: "domesticated canine animal",
          memoryTip: "Picture a dog waiting by the door with its tail wagging for its family.",
          markdownContent: "## Meaning\nA domesticated canine."
        }],
        existing: [],
        trashed: []
      }),
      "```"
    ].join("\n");
    const dogCandidate: LearningItem = {
      ...bankCandidate,
      id: "item-dog",
      title: "dog",
      cefr: "A1",
      sense: "domesticated canine animal",
      markdownContent: "## Meaning\nA domesticated canine."
    };
    const candidateQueries: string[][] = [];
    const createLearningItemsAtomically = vi.fn().mockResolvedValue([]);
    const classifyLearningItemDuplicates = vi.fn(
      async (drafts: LearningItemDraft[]) => [{
        draftId: drafts[0]!.id,
        decision: "existing" as const,
        itemId: "item-dog"
      }]
    );
    const { controller } = managedFixture(
      new MemoryChatConversationStore(),
      { answer },
      {
        findLearningItemCandidates: async (titles) => {
          candidateQueries.push(titles);
          return titles.includes("dog") ? [dogCandidate] : [];
        },
        createLearningItemsAtomically,
        classifyLearningItemDuplicates
      }
    );
    await controller.connect();

    await controller.sendMessage({
      text: "Add dogs",
      intent: "createLearningItems",
      learningItemTargets: [{ title: "dogs" }]
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    const batch = controller.getSnapshot().messages.find(
      (message) => message.learningItemBatch
    )?.learningItemBatch;
    expect(batch?.drafts[0]).toMatchObject({
      title: "dog",
      requestedTitles: ["dogs"]
    });

    await controller.submitLearningItemBatch(String(batch?.id));

    expect(candidateQueries).toEqual([["dogs"], ["dog"]]);
    expect(classifyLearningItemDuplicates).toHaveBeenCalledWith(
      [expect.objectContaining({ title: "dog" })],
      [dogCandidate]
    );
    expect(createLearningItemsAtomically).not.toHaveBeenCalled();
    expect(controller.getSnapshot().messages.find(
      (message) => message.learningItemBatch
    )?.learningItemBatch).toMatchObject({
      status: "submitted",
      existing: [{ itemId: "item-dog", title: "dog" }]
    });
    controller.close();
  });

  it("rejects a canonical title mapping that names an unrequested source target", async () => {
    const answer = [
      "Draft ready.",
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "dog",
          requestedTitles: ["cats"],
          itemType: "word",
      language: "en" as const,
          cefr: "A1",
          sense: "domesticated canine animal",
          memoryTip: "Picture a dog waiting by the door with its tail wagging for its family.",
          markdownContent: "## Meaning\nA domesticated canine."
        }],
        existing: [],
        trashed: []
      }),
      "```"
    ].join("\n");
    const { controller } = managedFixture(
      new MemoryChatConversationStore(),
      { answer }
    );
    await controller.connect();

    await controller.sendMessage({
      text: "Add dogs",
      intent: "createLearningItems",
      learningItemTargets: [{ title: "dogs" }]
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    const assistant = controller.getSnapshot().messages.find(
      (message) => message.role === "assistant"
    );
    expect(assistant?.learningItemBatch).toBeUndefined();
    expect(assistant?.artifactError).toMatch(/unrequested/);
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
    expect(assistant?.artifactError).toMatch(/candidate/);
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

  it("asks for typed targets when natural-language creation has no trusted target", () => {
    const prompt = composeCodexInput({
      text: "add this card",
      intent: "createLearningItems",
      explanationLanguage: "en"
    });

    expect(prompt).toContain("Requested learning-item targets: []");
    expect(prompt).toContain(
      "Use the user's explicit request and prior conversation to identify proposed word or phrase targets."
    );
    expect(prompt).toContain(
      "Do not emit a learning-item-result until the App supplies trusted requested targets."
    );
  });

  it("routes a multilingual creation request through trusted targets without conversational confirmation", async () => {
    const candidateQueries: string[][] = [];
    const answer = (prompt: string) => prompt.includes("$create-learning-items")
      ? [
          "已準備 **in advance** 的learning-item draft。",
          "```learning-item-result",
          JSON.stringify({
            drafts: [{
              title: "in advance",
              itemType: "phrase",
      language: "en" as const,
              cefr: "B1",
              sense: "before a future event",
              memoryTip: "想像時鐘的指針還沒走到活動時間，你已經先把事情完成了。",
              markdownContent: "## Meaning\n預先、提前。"
            }],
            existing: [],
            trashed: []
          }),
          "```"
        ].join("\n")
      : [
          "```learning-item-intent",
          JSON.stringify({
            intent: "createLearningItems",
            targets: [{ title: "in advance" }]
          }),
          "```"
        ].join("\n");
    const { fake, controller } = managedFixture(
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

    await controller.sendMessage({
      text: "增加這張卡片",
      explanationLanguage: "zh-TW"
    });
    await waitUntil(() =>
      controller.getSnapshot().activeTurnId === null &&
      fake.requests.filter((request) => request.method === "turn/start")
        .length === 2
    );

    expect(candidateQueries).toEqual([["in advance"]]);
    expect(fake.requests.filter((request) => request.method === "turn/start"))
      .toHaveLength(2);
    expect(controller.getSnapshot().messages).toMatchObject([{
      role: "user",
      text: "增加這張卡片"
    }, {
      role: "assistant",
      text: "已準備 **in advance** 的learning-item draft。",
      learningItemBatch: {
        drafts: [{ title: "in advance" }]
      }
    }]);
    expect(controller.getSnapshot().messages).toHaveLength(2);
    controller.close();
  });

  it("retries routed draft preparation with persisted targets instead of rerunning intent routing", async () => {
    let candidateAttempt = 0;
    const candidateQueries: string[][] = [];
    const answer = (prompt: string) => prompt.includes("$create-learning-items")
      ? [
          "Draft ready.",
          "```learning-item-result",
          JSON.stringify({
            drafts: [{
              title: "in advance",
              itemType: "phrase",
      language: "en" as const,
              cefr: "B1",
              sense: "before a future event",
              memoryTip: "Picture yourself arriving before the clock reaches the marked event time.",
              markdownContent: "## Meaning\nAhead of time."
            }],
            existing: [],
            trashed: []
          }),
          "```"
        ].join("\n")
      : [
          "```learning-item-intent",
          JSON.stringify({
            intent: "createLearningItems",
            targets: [{ title: "in advance" }]
          }),
          "```"
        ].join("\n");
    const { fake, controller } = managedFixture(
      new MemoryChatConversationStore(),
      { answer },
      {
        findLearningItemCandidates: async (titles) => {
          candidateQueries.push(titles);
          candidateAttempt += 1;
          if (candidateAttempt === 1) throw new Error("database busy");
          return [];
        }
      }
    );
    await controller.connect();
    await controller.sendMessage({
      text: "增加這張卡片",
      explanationLanguage: "en"
    });
    await waitUntil(() =>
      controller.getSnapshot().activeTurnId === null &&
      controller.getSnapshot().messages[0]?.learningItemPreparation
        ?.status === "failed"
    );
    const request = controller.getSnapshot().messages[0]!;

    expect(request.learningItemPreparation).toMatchObject({
      status: "failed",
      targets: [{ title: "in advance" }],
      error: "database busy"
    });
    expect(fake.requests.filter((item) => item.method === "turn/start"))
      .toHaveLength(1);

    await controller.retryLearningItemPreparation(request.id);
    await waitUntil(() =>
      controller.getSnapshot().activeTurnId === null &&
      Boolean(controller.getSnapshot().messages.find(
        (message) => message.learningItemBatch
      ))
    );

    expect(candidateQueries).toEqual([["in advance"], ["in advance"]]);
    expect(fake.requests.filter((item) => item.method === "turn/start"))
      .toHaveLength(2);
    expect(controller.getSnapshot().messages[0]?.learningItemPreparation)
      .toMatchObject({
        status: "completed",
        targets: [{ title: "in advance" }]
      });
    controller.close();
  });

  it("keeps clarified targets when an explicit creation confirmation has no new targets", async () => {
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
          text: "add these cards",
          status: "completed",
          learningItemRequest: { targets: [] }
        }, {
          id: "assistant-a",
          turnId: "turn-a",
          role: "assistant",
          text: "Do you mean apple and banana?",
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
      { answer: "Preparing both cards." },
      {
        findLearningItemCandidates: async (titles) => {
          candidateQueries.push(titles);
          return [];
        }
      }
    );
    await controller.connect();

    await controller.sendMessage({
      text: "add both cards",
      intent: "createLearningItems",
      explanationLanguage: "en"
    });
    await waitUntil(() => controller.getSnapshot().activeTurnId === null);

    expect(candidateQueries).toEqual([["apple", "banana"]]);
    expect(controller.getSnapshot().messages.findLast(
      (message) => message.role === "user"
    )?.learningItemRequest?.targets)
      .toEqual([
        { title: "apple", senseHint: "add both cards" },
        { title: "banana", senseHint: "add both cards" }
      ]);
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
      language: "en" as const,
              cefr: "A1",
              sense: "a round fruit",
              memoryTip: "Picture a red apple rolling in a circle across the table.",
              markdownContent: "## Meaning\nA round fruit."
            }, {
              title: "banana",
              itemType: "word",
      language: "en" as const,
              cefr: "A1",
              sense: "a long curved fruit",
              memoryTip: "Picture a yellow banana curved like a small moon.",
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
      language: "en" as const,
              cefr: "A1",
              sense: "a round fruit",
              memoryTip: "Picture a red apple rolling in a circle across the table.",
              markdownContent: "## Meaning\nA round fruit."
            }, {
              title: "banana",
              itemType: "word",
      language: "en" as const,
              cefr: "A1",
              sense: "a long curved fruit",
              memoryTip: "Picture a yellow banana curved like a small moon.",
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
      language: "en" as const,
              cefr: "A2",
              sense: "an organization that keeps and lends money",
              memoryTip: "想像錢包住進一棟會替你保管並借錢的建築。",
              markdownContent: "## Meaning\n銀行",
              state: "included"
            }, {
              id: "draft-reluctant",
              title: "reluctant",
              itemType: "word",
      language: "en" as const,
              cefr: "B2",
              sense: "unwilling or hesitant",
              memoryTip: "想像門已打開，但你的腳還黏在地上。",
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
      language: "en" as const,
      cefr: "C1",
      sense: "unwilling or hesitant",
      memoryTip: "想像門已打開，但你仍緊抓門框不想踏出去。",
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
      cefr: "C1",
      memoryTip: "想像門已打開，但你仍緊抓門框不想踏出去。"
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
      .rejects.toThrow(/submitted/);
    controller.close();
  });

  it("abandons a pending learning-item batch without mutating the learning library", async () => {
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
          text: "Draft ready",
          status: "completed",
          learningItemBatch: {
            id: "batch-a",
            status: "pending",
            drafts: [{
              id: "draft-a",
              title: "in advance",
              itemType: "phrase",
      language: "en" as const,
              cefr: "B1",
              sense: "before a future event",
              memoryTip: "想像行程尚未開始，行李已先放到門口。",
              markdownContent: "## Meaning\n預先。",
              state: "included"
            }],
            existing: [],
            trashed: []
          }
        }]
      }]
    });
    const createLearningItemsAtomically = vi.fn();
    const { controller } = managedFixture(
      store,
      {},
      { createLearningItemsAtomically }
    );

    const snapshot = controller.abandonLearningItemBatch("batch-a");

    expect(snapshot.messages[0]?.learningItemBatch).toMatchObject({
      id: "batch-a",
      status: "abandoned"
    });
    expect(snapshot.messages[0]?.learningItemBatch?.abandonedAt)
      .toBeTypeOf("number");
    expect(() => controller.setLearningItemDraftState(
      "batch-a",
      "draft-a",
      "excluded"
    )).toThrow(/discarded/);
    await expect(controller.submitLearningItemBatch("batch-a"))
      .rejects.toThrow(/discarded/);
    expect(createLearningItemsAtomically).not.toHaveBeenCalled();
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
      workingDirectory: "/tmp/vocabreader-codex-test",
      annotationExplanationSkillPath,
      annotationExplanationSkillInstructions,
      readingComprehensionSkillPath,
      readingComprehensionSkillInstructions,
      segmentRetellingSkillPath,
      segmentRetellingSkillInstructions,
      conversationStore: store
    });
    await controller.connect();
    await controller.sendMessage({ text: "Wait" });

    expect(() => controller.startNewConversation()).toThrow(/Wait/);
    expect(() => controller.selectConversation("missing")).toThrow(/Wait/);
    await expect(controller.removeConversation("missing")).rejects.toThrow(/Wait/);
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
      workingDirectory: "/tmp/vocabreader-codex-test",
      annotationExplanationSkillPath,
      annotationExplanationSkillInstructions,
      readingComprehensionSkillPath,
      readingComprehensionSkillInstructions,
      segmentRetellingSkillPath,
      segmentRetellingSkillInstructions,
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
      workingDirectory: "/tmp/vocabreader-codex-test",
      annotationExplanationSkillPath,
      annotationExplanationSkillInstructions,
      readingComprehensionSkillPath,
      readingComprehensionSkillInstructions,
      segmentRetellingSkillPath,
      segmentRetellingSkillInstructions,
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
      workingDirectory: "/tmp/vocabreader-codex-test",
      annotationExplanationSkillPath,
      annotationExplanationSkillInstructions,
      readingComprehensionSkillPath,
      readingComprehensionSkillInstructions,
      segmentRetellingSkillPath,
      segmentRetellingSkillInstructions,
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
  it.each([
    ["zh-TW", "Traditional Chinese"],
    ["en", "English"],
    ["ja", "Japanese"]
  ] as const)(
    "uses the %s explanation setting as the default language for ordinary chat",
    (explanationLanguage, expectedLanguage) => {
      const result = composeCodexInput({
        text: "Tell me more",
        explanationLanguage
      });

      expect(result).toContain(`Default response language: ${expectedLanguage}.`);
      expect(result).toContain(
        "Use another language only when the user explicitly asks for it"
      );
    }
  );

  it("uses the reading segment language for source-mode ordinary chat", () => {
    const withReadingSegment = composeCodexInput({
      text: "Tell me more",
      explanationLanguage: "source",
      context: {
        readingSegment: "A finite reading segment."
      }
    });
    const withoutReadingSegment = composeCodexInput({
      text: "Tell me more",
      explanationLanguage: "source"
    });

    expect(withReadingSegment).toContain(
      "Default response language: Use the same language as the current reading segment."
    );
    expect(withoutReadingSegment).toContain(
      "Default response language: Use the same language as the user's latest message."
    );
  });

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
    })).toContain("replaces earlier reading-segment and annotation context");
    expect(composeCodexInput({ text: "General question" }))
      .toContain("General question");
  });

  it("keeps inline annotations as ordinary context without forcing analysis", () => {
    const result = composeCodexInput({
      text: "What happened next?",
      context: {
        readingSegment: '<reading-segment>He was <reader-annotation id="A1">reluctant</reader-annotation>.</reading-segment>'
      }
    });

    expect(result).toContain('<reader-annotation id="A1">reluctant</reader-annotation>');
    expect(result).not.toContain("Word、Phrase、句子");
    expect(result).not.toContain("Explain annotations");
  });

  it.each([
    ["source", "Use the same language as the current reading segment"],
    ["zh-TW", "Traditional Chinese"],
    ["en", "English"],
    ["ja", "Japanese"],
    ["ko", "Korean"]
  ] as const)("passes the %s explanation language to the annotation skill", (
    explanationLanguage,
    expectedLanguage
  ) => {
    const result = composeCodexInput({
      text: "Explain annotations",
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

  it("uses the active learning language when the card explanation setting is source", () => {
    const result = composeCodexInput({
      text: "新增學習卡片",
      intent: "createLearningItems",
      learningLanguage: "en",
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

    expect(result).toContain("Learning-language workspace: English");
    expect(result).toContain("Explanation language for every learning item: English");
    expect(result).toContain("Do not create drafts for targets outside English");
    expect(result).not.toContain(
      "Explanation language: Use the same language as the current reading segment"
    );
  });

  it.each([
    ["zh-TW", "Traditional Chinese"],
    ["en", "English"],
    ["ja", "Japanese"],
    ["ko", "Korean"]
  ] as const)("uses fixed %s for every learning card", (
    explanationLanguage,
    expectedLanguage
  ) => {
    const result = composeCodexInput({
      text: "新增學習卡片",
      intent: "createLearningItems",
      learningLanguage: "en",
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

  it("uses the learning language for quiz output and the explanation language for feedback", () => {
    const result = composeCodexInput({
      text: "Start reading測驗",
      intent: "practiceReading",
      learningLanguage: "en",
      explanationLanguage: "zh-TW",
      context: {
        readingSegment: "<reading-segment>An English passage.</reading-segment>"
      }
    });

    expect(result).toContain("Quiz language: English");
    expect(result).toContain("Answer language for open-ended questions: English");
    expect(result).toContain("Corrected answer language: English");
    expect(result).toContain("Teaching and grading explanation language: Traditional Chinese");
    expect(result).toContain("$practice-reading-comprehension");
    expect(result).toContain("Do not impose a sentence-count requirement");
  });

  it("asks for a no-annotation response and supports source language", () => {
    const result = composeCodexInput({
      text: "Explain annotations",
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
      text: "Start reading測驗",
      intent: "practiceReading",
      context: {
        readingSegment: `<reading-segment>${words}</reading-segment>`
      }
    });

    expect(result).toContain("$practice-reading-comprehension");
    expect(result).toContain("Quiz language:");
    expect(result).toContain(
      "Answer language for open-ended questions: English"
    );
    expect(result).toContain("Do not use or infer content outside");
    expect(result).not.toContain("exactly 4");
    expect(result).not.toContain("3 to 10");
  });

  it("delegates source-language retelling with localized feedback to its fixed skill", () => {
    const result = composeCodexInput({
      text: "Start retelling practice",
      intent: "practiceRetelling" as never,
      explanationLanguage: "zh-TW",
      context: {
        readingSegment: "<reading-segment>An English passage.</reading-segment>"
      }
    });

    expect(result).toContain("$practice-segment-retelling");
    expect(result).toContain(
      "Retelling answer language: Detect and use the dominant language of the current reading segment"
    );
    expect(result).toContain("Feedback language: Traditional Chinese");
    expect(result).toContain("Do not impose a word, sentence, or detail count");
    expect(result).toContain("Do not use or infer content outside");
  });
});

describe("create-learning-items skill", () => {
  it("calibrates CEFR as sense-specific cross-language usage frequency", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain("## Frequency-based CEFR Contract");
    expect(skill).toContain("language + canonical title + intended sense");
    expect(skill).toContain(
      "modern everyday speech and general written content"
    );
    expect(skill).toContain("A1: Core survival and basic functional language");
    expect(skill).toContain("A2: Common everyday language");
    expect(skill).toContain("B1: Regularly encountered");
    expect(skill).toContain("B2: Recognizable to an educated adult");
    expect(skill).toContain("C1: Low-frequency, precise, literary, academic");
    expect(skill).toContain("C2: Extremely rare, archaic, highly specialized");
    expect(skill).toContain(
      "Do not assign the same level to different senses merely because they share a title"
    );
    expect(skill).toContain(
      "Apply this rubric in the learning item's own target language"
    );
    expect(skill).toContain(
      "Do not default uncertain items to B2"
    );
  });

  it("defines workspace-bound source language and fixed explanation behavior", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain(
      "use the active learning-language workspace as the explanation language for every draft"
    );
    expect(skill).toContain(
      "Every requested target and every draft must belong to that language"
    );
    expect(skill).toContain(
      "When the App requests a fixed language, use that language for every draft in the batch"
    );
    expect(skill).toContain("not contain multiple language values or `other`");
    expect(skill).toContain(
      "Keep `sense` as a short English semantic identifier"
    );
    expect(skill).toContain(
      "dictionary headword or citation form used by that target's language"
    );
    expect(skill).toContain("`dogs` → `dog`");
    expect(skill).toContain("Japanese `食べました` → `食べる`");
    expect(skill).toContain("Spanish");
    expect(skill).toContain("`requestedTitles`");
  });

  it("uses each learning item's language for examples instead of forcing English", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain(
      "Write every example in the learning item's own language"
    );
    expect(skill).toContain(
      "When the explanation language and learning-item language are the same, follow every example with a simpler same-language paraphrase"
    );
    expect(skill).not.toContain("complete English examples");
  });

  it("standardizes one explanation-language-aware support line under every example", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain("## Example Support Contract");
    expect(skill).toContain("bold the target word or phrase");
    expect(skill).toContain("one indented arrow line");
    expect(skill).toContain("begin that line with `→`");
    expect(skill).not.toContain("**In other words:**");
    expect(skill).not.toContain("**翻譯：**");
    expect(skill).toContain("Do not add a textual label before the support");
    expect(skill).toMatch(
      /same,\s+write a simpler same-language paraphrase/
    );
    expect(skill).toMatch(
      /different,\s+write a natural translation in the explanation language/
    );
    expect(skill).toMatch(
      /Never\s+provide both a paraphrase and a translation for the same example/
    );
  });

  it("preserves useful target-sense detail without mechanically copying annotation analysis", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain("## Optional Learning Detail Contract");
    expect(skill).toMatch(
      /preserve details that have lasting\s+value for understanding or correctly using the target sense/
    );
    expect(skill).toContain("Context and nuance");
    expect(skill).toContain("Grammar and usage");
    expect(skill).toContain("Synonyms and distinctions");
    expect(skill).toContain("Common mistakes");
    expect(skill).toContain("Pronunciation notes");
    expect(skill).toMatch(/Do not\s+impose a fixed word limit/);
    expect(skill).toContain(
      "Do not add optional sections mechanically or pad a simple item"
    );
  });

  it("reuses only relevant detail when creation follows an annotation invitation", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain(
      "follows the reader's acceptance of a learning-library invitation"
    );
    expect(skill).toContain(
      "prior annotation explanation in the same AI conversation"
    );
    expect(skill).toMatch(
      /Prefer useful detail already established for\s+this exact target and sense/
    );
    expect(skill).toContain("other marked items");
    expect(skill).toContain("sentence-only analysis");
    expect(skill).toContain("review table");
    expect(skill).toContain("source metadata");
    expect(skill).toContain(
      "Do not copy the entire annotation explanation verbatim"
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

  it("revalidates trusted targets and excludes sentences or clauses from drafts", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain(
      "Revalidate every App-supplied target as an eligible word or reusable phrase"
    );
    expect(skill).toContain(
      "Do not assume that an upstream invitation classified the target correctly"
    );
    expect(skill).toMatch(
      /Never emit a draft, existing match, or trashed match for a complete sentence or clause/
    );
    expect(skill).toContain(
      "部分も多少はあるのですが、コミュニケーションが取れないほど大きな違いはありません"
    );
    expect(skill).toContain("外国語を学ぶ動機は人それぞれですが");
    expect(skill).toContain("理論上");
    expect(skill).toContain("私の経験上");
  });

  it("revalidates sentence boundaries in every supported learning language", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain("Apply the same eligibility boundary to every language");
    expect(skill).toContain(
      "There is no difference large enough to prevent communication"
    );
    expect(skill).toContain(
      "Although motivations for learning a language differ from person to person"
    );
    expect(skill).toContain("in theory");
    expect(skill).toContain("in my experience");
    expect(skill).toContain("差異並沒有大到無法溝通的程度");
    expect(skill).toContain("雖然學習外語的動機因人而異");
    expect(skill).toContain("依我的經驗");
    expect(skill).toContain("의사소통이 불가능할 정도로 큰 차이는 없습니다");
    expect(skill).toContain("외국어를 배우는 동기는 사람마다 다르지만");
    expect(skill).toContain("이론상");
    expect(skill).toContain("제 경험상");
  });

  it("supports Korean learning-item drafts and examples", () => {
    const skill = learningItemCreationSkillInstructions;

    expect(skill).toContain(
      "Korean items use Korean examples"
    );
    expect(skill).toContain(
      "the App-provided active workspace code (`en`, `ja`, `zh-TW`, or `ko`)"
    );
    expect(skill).toMatch(
      /A batch may\s+not contain multiple language values or `other`/
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

  it("classifies Japanese propositions and connective clauses as sentences", () => {
    const skill = annotationExplanationSkillInstructions;

    expect(skill).toContain(
      "A phrase must be a reusable lexical expression, fixed expression, collocation, or grammar unit"
    );
    expect(skill).toContain(
      "Classify a marked span as a sentence when it expresses a proposition with its own predicate"
    );
    expect(skill).toContain(
      "even when the selection omits final punctuation or ends inside a larger sentence"
    );
    expect(skill).toContain(
      "Japanese finite predicates and connective clause endings"
    );
    expect(skill).toContain("ですが");
    expect(skill).toContain("ありません");
    expect(skill).toContain("理論上");
    expect(skill).toContain("私の経験上");
    expect(skill).toMatch(/Do not classify by character count or punctuation alone/);
  });

  it("defines sentence and phrase examples for every supported learning language", () => {
    const skill = annotationExplanationSkillInstructions;

    expect(skill).toContain("Apply this boundary to every language");
    expect(skill).toContain(
      "There is no difference large enough to prevent communication"
    );
    expect(skill).toContain(
      "Although motivations for learning a language differ from person to person"
    );
    expect(skill).toContain("in theory");
    expect(skill).toContain("in my experience");
    expect(skill).toContain("差異並沒有大到無法溝通的程度");
    expect(skill).toContain("雖然學習外語的動機因人而異");
    expect(skill).toContain("依我的經驗");
    expect(skill).toContain("의사소통이 불가능할 정도로 큰 차이는 없습니다");
    expect(skill).toContain("외국어를 배우는 동기는 사람마다 다르지만");
    expect(skill).toContain("이론상");
    expect(skill).toContain("제 경험상");
  });
});
