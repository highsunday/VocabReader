import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalChatConversationStore,
  type StoredChatState
} from "./chat-conversation-store";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "vocabreader-chat-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function storedState(): StoredChatState {
  return {
    version: 1,
    selectedConversationId: "conversation-b",
    conversations: [{
      id: "conversation-a",
      threadId: "thread-a",
      title: "General question",
      createdAt: 100,
      updatedAt: 200,
      source: null,
      messages: [{
        id: "user-a",
        turnId: "turn-a",
        role: "user",
        text: "General question",
        status: "completed"
      }]
    }, {
      id: "conversation-b",
      threadId: "thread-b",
      title: "Explain this sentence",
      createdAt: 300,
      updatedAt: 400,
      source: { bookTitle: "A Book", chapterTitle: "Opening" },
      messages: [{
        id: "assistant-b",
        turnId: "turn-b",
        role: "assistant",
        text: "Still answering",
        status: "streaming"
      }]
    }]
  };
}

describe("LocalChatConversationStore", () => {
  it("atomically saves global conversations and normalizes interrupted streaming messages on reload", async () => {
    const directory = await temporaryDirectory();
    const store = new LocalChatConversationStore(directory);

    store.save(storedState());
    const loaded = store.load();

    expect(loaded.selectedConversationId).toBe("conversation-b");
    expect(loaded.conversations.map((conversation) => conversation.id))
      .toEqual(["conversation-a", "conversation-b"]);
    expect(loaded.conversations[1]?.messages[0]?.status).toBe("failed");
    expect(JSON.parse(await readFile(join(directory, "conversations.json"), "utf8")))
      .toMatchObject({ version: 2, selectedConversationId: "conversation-b" });
  });

  it("rejects corrupt persisted data without overwriting the source file", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "conversations.json");
    await writeFile(path, "{corrupt", "utf8");
    const store = new LocalChatConversationStore(directory);

    expect(() => store.load()).toThrow(/AI conversation history/);
    expect(await readFile(path, "utf8")).toBe("{corrupt");
  });

  it("loads only the ten most recently updated conversations without trimming their messages", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "conversations.json");
    const conversations = Array.from({ length: 12 }, (_, index) => ({
      id: `conversation-${index + 1}`,
      threadId: `thread-${index + 1}`,
      title: `Conversation ${index + 1}`,
      createdAt: index + 1,
      updatedAt: index + 1,
      source: null,
      messages: Array.from({ length: 11 }, (_, messageIndex) => ({
        id: `message-${index + 1}-${messageIndex + 1}`,
        turnId: `turn-${index + 1}-${messageIndex + 1}`,
        role: messageIndex % 2 === 0
          ? "user" as const
          : "assistant" as const,
        text: `Message ${messageIndex + 1}`,
        status: "completed" as const
      }))
    }));
    await writeFile(path, JSON.stringify({
      version: 2,
      selectedConversationId: "conversation-1",
      conversations
    }), "utf8");

    const store = new LocalChatConversationStore(directory);
    const loaded = store.load();

    expect(loaded.selectedConversationId).toBeNull();
    expect(loaded.conversations.map(({ id }) => id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `conversation-${index + 3}`)
    );
    expect(loaded.conversations.at(-1)?.messages).toHaveLength(11);

    store.save({
      version: 2,
      selectedConversationId: "conversation-12",
      conversations
    });
    const saved = JSON.parse(await readFile(path, "utf8"));
    expect(saved).toMatchObject({
      selectedConversationId: "conversation-12",
      conversations: expect.arrayContaining([
        expect.objectContaining({ id: "conversation-12" })
      ])
    });
    expect(saved.conversations).toHaveLength(10);
  });

  it("migrates version-one conversations and persists learning-item artifacts", async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, "conversations.json");
    await writeFile(path, JSON.stringify({
      version: 1,
      selectedConversationId: "conversation-a",
      conversations: [{
        id: "conversation-a",
        threadId: "thread-a",
        title: "Add cards",
        createdAt: 100,
        updatedAt: 200,
        source: null,
        messages: [{
          id: "assistant-a",
          turnId: "turn-a",
          role: "assistant",
          text: "Ready",
          status: "completed"
        }]
      }]
    }), "utf8");
    const store = new LocalChatConversationStore(directory);
    const migrated = store.load();
    const message = migrated.conversations[0]?.messages[0];
    if (!message) throw new Error("missing fixture message");
    message.learningItemBatch = {
      id: "batch-1",
      status: "pending",
      drafts: [{
        id: "draft-1",
        title: "reluctant",
        itemType: "word",
      language: "en" as const,
        cefr: "B2",
        sense: "unwilling",
        markdownContent: "## Meaning\n不情願。",
        state: "excluded"
      }],
      existing: [],
      trashed: []
    };
    message.learningItemRequest = {
      targets: [{ title: "apple" }, { title: "banana" }]
    };
    message.learningItemPreparation = {
      status: "preparing",
      targets: [{ title: "apple" }, { title: "banana" }],
      explanationLanguage: "zh-TW"
    };

    store.save(migrated);
    const reloaded = store.load();

    expect(reloaded.version).toBe(2);
    expect(reloaded.conversations[0]?.messages[0]?.learningItemBatch)
      .toEqual(message.learningItemBatch);
    expect(reloaded.conversations[0]?.messages[0]?.learningItemRequest)
      .toEqual(message.learningItemRequest);
    expect(reloaded.conversations[0]?.messages[0]?.learningItemPreparation)
      .toEqual({
        status: "failed",
        targets: [{ title: "apple" }, { title: "banana" }],
        explanationLanguage: "zh-TW",
        error: "The previous card preparation did not finish. Please retry."
      });
    expect(JSON.parse(await readFile(path, "utf8")).version).toBe(2);
  });
});
