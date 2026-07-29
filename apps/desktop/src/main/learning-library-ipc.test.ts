import { describe, expect, it, vi } from "vitest";
import type { LearningItem } from "../shared/learning-contracts";
import { registerLearningLibraryIpc } from "./learning-library-ipc";

const item: LearningItem = {
  id: "item-1",
  title: "reluctant",
  itemType: "word",
  cefr: "B2",
  sense: "unwilling",
  markdownContent: "## Meaning\n不情願。",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  trashedAt: null
};

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const library = {
    listItems: vi.fn().mockResolvedValue([item]),
    getItem: vi.fn().mockResolvedValue(item),
    updateItem: vi.fn().mockResolvedValue(item),
    trashItem: vi.fn().mockResolvedValue({ ...item, status: "trashed" }),
    restoreItem: vi.fn().mockResolvedValue(item),
    emptyTrash: vi.fn().mockResolvedValue({ deleted: 1 })
  };
  registerLearningLibraryIpc({
    handle(channel, listener) {
      handlers.set(channel, listener);
    }
  }, library);
  return { handlers, library };
}

describe("learning library IPC", () => {
  it("registers only the typed list/get/update/trash/restore/empty operations", async () => {
    const { handlers, library } = setup();
    const listInput = {
      status: "active",
      search: "rel",
      itemType: "word",
      cefr: "B2",
      studyStatus: "learning",
      sort: "study-status"
    };
    const updateInput = {
      itemId: item.id,
      title: item.title,
      itemType: item.itemType,
      cefr: item.cefr,
      sense: item.sense,
      markdownContent: item.markdownContent
    };

    expect([...handlers.keys()].sort()).toEqual([
      "learning:empty-trash",
      "learning:get",
      "learning:list",
      "learning:restore",
      "learning:trash",
      "learning:update"
    ]);
    await expect(handlers.get("learning:list")?.({}, listInput)).resolves.toEqual([item]);
    await expect(handlers.get("learning:get")?.({}, item.id)).resolves.toEqual(item);
    await expect(handlers.get("learning:update")?.({}, updateInput)).resolves.toEqual(item);
    await expect(handlers.get("learning:trash")?.({}, item.id))
      .resolves.toMatchObject({ status: "trashed" });
    await expect(handlers.get("learning:restore")?.({}, item.id)).resolves.toEqual(item);
    await expect(handlers.get("learning:empty-trash")?.({})).resolves.toEqual({ deleted: 1 });

    expect(library.listItems).toHaveBeenCalledWith(listInput);
    expect(library.updateItem).toHaveBeenCalledWith(updateInput);
  });

  it("rejects malformed cross-process data before repository calls", () => {
    const { handlers, library } = setup();

    expect(() => handlers.get("learning:list")?.({}, {
      status: "active",
      studyStatus: "mastered",
      sort: "recent"
    })).toThrow(/Invalid Learning Library query/);
    expect(() => handlers.get("learning:get")?.({}, "")).toThrow(/learning-item request/);
    expect(() => handlers.get("learning:update")?.({}, {
      itemId: item.id,
      title: item.title,
      itemType: "sentence",
      cefr: "B2",
      sense: item.sense,
      markdownContent: item.markdownContent
    })).toThrow(/learning-item update/);
    expect(() => handlers.get("learning:trash")?.({}, " ")).toThrow(
      /learning-item deletion/
    );
    expect(() => handlers.get("learning:restore")?.({}, null)).toThrow(
      /learning-item restore/
    );

    expect(library.listItems).not.toHaveBeenCalled();
    expect(library.updateItem).not.toHaveBeenCalled();
    expect(library.trashItem).not.toHaveBeenCalled();
    expect(library.restoreItem).not.toHaveBeenCalled();
  });
});
