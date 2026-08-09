import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalListenRepeatStore } from "./listen-repeat-store";

const progressive = {
  practiceId: "practice-1",
  material: "One, two.",
  mode: "progressive" as const,
  longChunks: [{
    text: "One, two.",
    shortChunks: [{ text: "One, " }, { text: "two." }]
  }]
};

describe("LocalListenRepeatStore", () => {
  it("persists one exact current practice and restores it after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-store-"));
    const store = new LocalListenRepeatStore(root, {
      now: () => new Date("2026-08-10T00:00:00.000Z")
    });
    const first = await store.replacePractice(progressive);
    const restored = await new LocalListenRepeatStore(root).getSnapshot(false);

    expect(first.practice?.material).toBe(progressive.material);
    expect(restored.practice).toEqual(first.practice);
    expect(restored.progress).toEqual({
      shortCompleted: 0,
      shortTotal: 2,
      longCompleted: 0,
      longTotal: 1,
      complete: false
    });
  });

  it("unlocks a Progressive long recording after every child is saved and never relocks it", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-unlock-"));
    const store = new LocalListenRepeatStore(root);
    const initial = await store.replacePractice(progressive);
    const long = initial.practice!.longChunks[0];
    const [first, second] = long.shortChunks;

    expect(long.recordingUnlocked).toBe(false);
    await store.saveRecording({
      practiceId: progressive.practiceId,
      chunkId: first.id,
      mimeType: "audio/webm;codecs=opus",
      audio: new Uint8Array([1, 2, 3])
    });
    const unlocked = await store.saveRecording({
      practiceId: progressive.practiceId,
      chunkId: second.id,
      mimeType: "audio/webm;codecs=opus",
      audio: new Uint8Array([4, 5, 6])
    });
    expect(unlocked.practice!.longChunks[0].recordingUnlocked).toBe(true);

    const rerecorded = await store.saveRecording({
      practiceId: progressive.practiceId,
      chunkId: first.id,
      mimeType: "audio/webm;codecs=opus",
      audio: new Uint8Array([9])
    });
    expect(rerecorded.practice!.longChunks[0].recordingUnlocked).toBe(true);
    expect((await store.getRecording(progressive.practiceId, first.id)).audio)
      .toEqual(new Uint8Array([9]));
  });

  it("rejects forged identifiers and bad audio without replacing an existing recording", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-validation-"));
    const store = new LocalListenRepeatStore(root);
    const initial = await store.replacePractice(progressive);
    const chunkId = initial.practice!.longChunks[0].shortChunks[0].id;
    await store.saveRecording({
      practiceId: progressive.practiceId,
      chunkId,
      mimeType: "audio/webm",
      audio: new Uint8Array([7, 8])
    });

    await expect(store.saveRecording({
      practiceId: progressive.practiceId,
      chunkId: "../../escape",
      mimeType: "audio/webm",
      audio: new Uint8Array([1])
    })).rejects.toThrow(/chunk/i);
    await expect(store.saveRecording({
      practiceId: progressive.practiceId,
      chunkId,
      mimeType: "text/plain",
      audio: new Uint8Array([1])
    })).rejects.toThrow(/audio format/i);
    expect((await store.getRecording(progressive.practiceId, chunkId)).audio)
      .toEqual(new Uint8Array([7, 8]));
  });

  it("ignores a stale temporary metadata file and clears only its own data", async () => {
    const root = await mkdtemp(join(tmpdir(), "listen-repeat-clear-"));
    const unrelated = join(root, "..", "unrelated.txt");
    const store = new LocalListenRepeatStore(root);
    await store.replacePractice(progressive);
    await writeFile(join(root, "current.json.next"), "{broken", "utf8");
    await writeFile(unrelated, "keep", "utf8");

    const restored = await new LocalListenRepeatStore(root).getSnapshot(false);
    expect(restored.practice?.id).toBe(progressive.practiceId);
    const cleared = await store.clear(false);
    expect(cleared.practice).toBeNull();
    expect(await readFile(unrelated, "utf8")).toBe("keep");
  });
});
