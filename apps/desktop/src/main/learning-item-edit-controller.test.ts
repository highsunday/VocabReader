import { describe, expect, it, vi } from "vitest";
import type {
  CodexAppServerClient,
  CodexNotification
} from "./codex-app-server-client";
import {
  inferLearningContentLanguage,
  LearningItemEditController
} from "./learning-item-edit-controller";

function fakeClient(prompts: string[]): CodexAppServerClient {
  let listener: ((notification: CodexNotification) => void) | undefined;
  return {
    initialize: vi.fn(async () => undefined),
    readAccount: vi.fn(async () => ({
      account: { type: "chatgpt" },
      requiresOpenaiAuth: false
    })),
    request: vi.fn(async (method, params) => {
      if (method === "thread/start") return { thread: { id: "thread-edit" } };
      if (method === "turn/start") {
        const input = params?.input as Array<{ type: string; text?: string }>;
        const prompt = input.find(({ type }) => type === "text")?.text ?? "";
        prompts.push(prompt);
        const payload = JSON.parse(prompt.match(/Edit payload: (.+)\n/)![1]);
        const response = `\`\`\`learning-item-edit-result\n${JSON.stringify({
          version: 1,
          kind: "learning-item-edit-result",
          sessionId: payload.sessionId,
          itemId: payload.itemId,
          markdownContent: `${payload.markdownContent}\n\n## impair vs. repair\n兩者意思相反。`,
          cautionNote: "impair 是削弱；repair 是修復。"
        })}\n\`\`\``;
        setTimeout(() => {
          listener?.({
            method: "item/completed",
            params: {
              threadId: "thread-edit",
              turnId: "turn-edit",
              item: { type: "agentMessage", text: response }
            }
          });
          listener?.({
            method: "turn/completed",
            params: {
              threadId: "thread-edit",
              turn: { id: "turn-edit", status: "completed" }
            }
          });
        }, 0);
        return { turn: { id: "turn-edit" } };
      }
      return {};
    }),
    onNotification: (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    onExit: () => () => undefined,
    close: vi.fn()
  };
}

describe("LearningItemEditController", () => {
  it("infers the explanation language from card content, not the request language", () => {
    expect(inferLearningContentLanguage(
      "## Meaning\nTo weaken or reduce effectiveness.\n\n## Examples\n1. Sleep loss can impair judgment.",
      ""
    )).toBe("English");
    expect(inferLearningContentLanguage(
      "## Meaning\n削弱或損害某事物的效能。",
      "不要與 repair 混淆。"
    )).toBe("Traditional Chinese");
    expect(inferLearningContentLanguage(
      "## 意味\n能力や機能を弱めること。",
      "repair と混同しない。"
    )).toBe("Japanese");
  });

  it("keeps one bounded draft transient until explicit apply", async () => {
    const prompts: string[] = [];
    const item = {
      id: "item-impair",
      title: "impair",
      itemType: "word" as const,
      language: "en" as const,
      cefr: "B2" as const,
      sense: "weaken or damage",
      markdownContent: "## Meaning\n損害或削弱。",
      cautionNote: "",
      representativeImageDataUrl: "data:image/jpeg;base64,cHJpdmF0ZS1pbWFnZQ==",
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      trashedAt: null
    };
    const library = {
      getItem: vi.fn(async () => item),
      applyAiEdit: vi.fn(async (input) => ({
        ...item,
        markdownContent: input.markdownContent,
        cautionNote: input.cautionNote
      }))
    };
    const controller = new LearningItemEditController({
      createClient: () => fakeClient(prompts),
      workingDirectory: "/tmp/edit-runtime",
      skillPath: "/tmp/edit-runtime/.agents/skills/edit-learning-item/SKILL.md",
      skillInstructions: "bounded edit instructions",
      library,
      createId: () => "session-edit"
    });

    const started = await controller.start(item.id);
    expect(started).toMatchObject({ hasChanges: false, phase: "ready" });
    const edited = await controller.send(
      started.sessionId,
      "我常把 impair 誤解成 repair。"
    );
    expect(edited).toMatchObject({
      hasChanges: true,
      draft: { cautionNote: "impair 是削弱；repair 是修復。" }
    });
    expect(library.applyAiEdit).not.toHaveBeenCalled();
    const payload = JSON.parse(prompts[0].match(/Edit payload: (.+)\n/)![1]);
    expect(payload).toEqual({
      sessionId: "session-edit",
      itemId: item.id,
      title: item.title,
      sense: item.sense,
      primaryExplanationLanguage: "Traditional Chinese",
      markdownContent: item.markdownContent,
      cautionNote: "",
      request: "我常把 impair 誤解成 repair。"
    });
    expect(payload).not.toHaveProperty("cefr");
    expect(payload).not.toHaveProperty("representativeImageDataUrl");
    await controller.apply(started.sessionId);
    expect(library.applyAiEdit).toHaveBeenCalledWith(expect.objectContaining({
      itemId: item.id,
      baseUpdatedAt: item.updatedAt,
      cautionNote: "impair 是削弱；repair 是修復。"
    }));
  });

  it("stops safely even before Codex returns the turn identifier", async () => {
    let resolveTurn: ((value: { turn: { id: string } }) => void) | undefined;
    const request = vi.fn(async (method: string) => {
      if (method === "thread/start") return { thread: { id: "thread-slow" } };
      if (method === "turn/start") {
        return new Promise<{ turn: { id: string } }>((resolve) => {
          resolveTurn = resolve;
        });
      }
      return {};
    });
    const item = {
      id: "item-slow",
      title: "impair",
      itemType: "word" as const,
      language: "en" as const,
      cefr: "B2" as const,
      sense: "weaken",
      markdownContent: "## Meaning\n削弱。",
      cautionNote: "",
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      trashedAt: null
    };
    const controller = new LearningItemEditController({
      createClient: () => ({
        initialize: vi.fn(async () => undefined),
        readAccount: vi.fn(),
        request,
        onNotification: () => () => undefined,
        onExit: () => () => undefined,
        close: vi.fn()
      } as unknown as CodexAppServerClient),
      workingDirectory: "/tmp/edit-runtime",
      skillPath: "/tmp/edit-runtime/.agents/skills/edit-learning-item/SKILL.md",
      skillInstructions: "bounded edit instructions",
      library: {
        getItem: vi.fn(async () => item),
        applyAiEdit: vi.fn()
      },
      createId: () => "session-slow"
    });

    const started = await controller.start(item.id);
    const sending = controller.send(started.sessionId, "補充比較");
    const stopped = await controller.stop(started.sessionId);

    expect(stopped).toMatchObject({
      phase: "error",
      status: "AI editing stopped. Your last valid draft is unchanged."
    });
    resolveTurn?.({ turn: { id: "turn-slow" } });
    await expect(sending).rejects.toThrow(/stopped/);
    expect(request).toHaveBeenCalledWith("turn/interrupt", {
      threadId: "thread-slow",
      turnId: "turn-slow"
    });
  });
});
