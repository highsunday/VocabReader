import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalLearningLibrary } from "./learning-library-service";

const temporaryDirectories: string[] = [];

async function databasePath() {
  const directory = await mkdtemp(join(tmpdir(), "lingoshelf-learning-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "learning.sqlite");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("LocalLearningLibrary", () => {
  it("migrates and seeds ten stable examples exactly once", async () => {
    const path = await databasePath();
    const first = new LocalLearningLibrary(path);
    const seeded = await first.listItems({ status: "active", sort: "recent" });
    const restarted = new LocalLearningLibrary(path);

    expect(seeded).toHaveLength(10);
    expect(new Set(seeded.map((item) => item.itemType))).toEqual(
      new Set(["word", "phrase"])
    );
    expect(new Set(seeded.map((item) => item.cefr))).toEqual(
      new Set(["A1", "A2", "B1", "B2", "C1", "C2"])
    );
    expect(seeded.filter((item) => item.title === "bank")).toHaveLength(2);
    expect(seeded.every((item) =>
      item.markdownContent.includes("## Examples") &&
      (item.markdownContent.match(/^\d+\./gm)?.length ?? 0) >= 3
    )).toBe(true);
    await expect(
      restarted.listItems({ status: "active", sort: "recent" })
    ).resolves.toEqual(seeded);
  });

  it("never reseeds after every example is permanently removed", async () => {
    const path = await databasePath();
    const library = new LocalLearningLibrary(path);
    const items = await library.listItems({ status: "active", sort: "recent" });
    for (const item of items) await library.trashItem(item.id);
    await library.emptyTrash();

    const restarted = new LocalLearningLibrary(path);
    await expect(
      restarted.listItems({ status: "active", sort: "recent" })
    ).resolves.toEqual([]);
  });

  it("searches only titles and combines type, CEFR, and sort filters", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    await library.createItem({
      title: "ordinary",
      itemType: "word",
      cefr: "B2",
      sense: "search boundary",
      markdownContent: "## Meaning\nThis content mentions fastidious."
    });

    const titleMatches = await library.listItems({
      status: "active",
      search: "FAST",
      sort: "alphabetical"
    });
    const filtered = await library.listItems({
      status: "active",
      itemType: "phrase",
      cefr: "B2",
      sort: "alphabetical"
    });

    expect(titleMatches.map((item) => item.title)).toEqual(["fastidious"]);
    expect(filtered.map((item) => item.title)).toEqual(["take for granted"]);
  });

  it("persists valid edits and rejects invalid structured values", async () => {
    const path = await databasePath();
    const library = new LocalLearningLibrary(path);
    const item = (await library.listItems({
      status: "active",
      search: "reluctant",
      sort: "recent"
    }))[0];

    const updated = await library.updateItem({
      itemId: item.id,
      title: "reluctant",
      itemType: "word",
      cefr: "C1",
      sense: "unwilling to act",
      markdownContent: "## Meaning\n不情願。\n\n## Examples\n1. She was reluctant to leave."
    });

    expect(updated.cefr).toBe("C1");
    await expect(new LocalLearningLibrary(path).getItem(item.id))
      .resolves.toEqual(updated);
    await expect(library.updateItem({
      itemId: item.id,
      title: "",
      itemType: "word",
      cefr: "C1",
      sense: "unwilling",
      markdownContent: "content"
    })).rejects.toThrow(/標題/);
  });

  it("moves an item to trash, restores it, and permanently empties trash", async () => {
    const library = new LocalLearningLibrary(await databasePath());
    const item = (await library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    }))[0];

    const trashed = await library.trashItem(item.id);
    expect(trashed.status).toBe("trashed");
    await expect(library.listItems({
      status: "active",
      search: "happy",
      sort: "recent"
    })).resolves.toEqual([]);
    await expect(library.listItems({
      status: "trashed",
      sort: "recent"
    })).resolves.toContainEqual(trashed);

    const restored = await library.restoreItem(item.id);
    expect(restored).toMatchObject({ id: item.id, status: "active" });

    await library.trashItem(item.id);
    await expect(library.emptyTrash()).resolves.toEqual({ deleted: 1 });
    await expect(library.emptyTrash()).resolves.toEqual({ deleted: 0 });
    await expect(library.getItem(item.id)).rejects.toThrow(/找不到/);
  });
});
