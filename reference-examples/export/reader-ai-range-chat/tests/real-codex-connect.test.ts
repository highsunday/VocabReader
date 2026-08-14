import assert from "node:assert/strict";
import { test } from "vitest";
import { ChatController } from "../src/main/chat-controller";
import { SpawnedCodexAppServerClient } from "../src/main/codex-app-server-client";

test("connects to the locally installed and authenticated Codex app-server", async () => {
  const controller = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient(),
    workingDirectory: process.cwd()
  });
  try {
    const snapshot = await controller.connect();
    assert.equal(snapshot.connection, "ready", snapshot.connectionDetail);
  } finally {
    controller.close();
  }
}, 30_000);
