import { describe, expect, it } from "vitest";
import { ChatController, composeCodexInput } from "./chat-controller";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import { createFakeCodexAppServer } from "./fake-codex-app-server";

function fixture(options: Parameters<typeof createFakeCodexAppServer>[0] = {}) {
  const fake = createFakeCodexAppServer(options);
  const controller = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient({
      spawnProcess: () => fake.child
    }),
    workingDirectory: "/tmp/lingoshelf-codex-test"
  });
  return { fake, controller };
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
    expect(composeCodexInput({ text: "General question" }))
      .toBe("General question");
  });
});
