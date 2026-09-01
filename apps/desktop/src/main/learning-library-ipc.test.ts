import { describe, expect, it, vi } from "vitest";
import type { LearningItem } from "../shared/learning-contracts";
import { registerLearningLibraryIpc } from "./learning-library-ipc";

const item: LearningItem = {
  id: "item-1",
  title: "reluctant",
  itemType: "word",
      language: "en" as const,
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
    listItemPage: vi.fn().mockResolvedValue({
      items: [{ ...item, markdownContent: undefined }],
      nextCursor: "next-page"
    }),
    countItems: vi.fn().mockResolvedValue({
      active: 1,
      trashed: 0,
      progress: { new: 1, studying: 0, familiar: 0, strong: 0 }
    }),
    getItem: vi.fn().mockResolvedValue(item),
    updateItem: vi.fn().mockResolvedValue(item),
    trashItem: vi.fn().mockResolvedValue({ ...item, status: "trashed" }),
    restoreItem: vi.fn().mockResolvedValue(item),
    emptyTrash: vi.fn().mockResolvedValue({ deleted: 1 })
  };
  const representativeImages = {
    select: vi.fn().mockResolvedValue({ status: "updated", item }),
    setFromUrl: vi.fn().mockResolvedValue(item),
    remove: vi.fn().mockResolvedValue(item)
  };
  registerLearningLibraryIpc({
    handle(channel, listener) {
      handlers.set(channel, listener);
    }
  }, library, representativeImages);
  return { handlers, library, representativeImages };
}

describe("learning library IPC", () => {
  it("registers typed paged-list/count/get/update/trash/restore/empty operations", async () => {
    const { handlers, library, representativeImages } = setup();
    const listInput = {
      status: "active",
      search: "rel",
      itemType: "word",
      language: "en" as const,
      cefr: "B2",
      studyStatus: "learning",
      sort: "study-status"
    };
    const updateInput = {
      itemId: item.id,
      title: item.title,
      itemType: item.itemType,
      language: "en" as const,
      cefr: item.cefr,
      sense: item.sense,
      markdownContent: item.markdownContent,
      memoryTip: item.memoryTip ?? "",
      cautionNote: ""
    };

    expect([...handlers.keys()].sort()).toEqual([
      "learning:counts",
      "learning:empty-trash",
      "learning:get",
      "learning:list",
      "learning:remove-representative-image",
      "learning:restore",
      "learning:select-representative-image",
      "learning:set-representative-image-from-url",
      "learning:trash",
      "learning:update"
    ]);
    await expect(handlers.get("learning:list")?.({}, listInput)).resolves.toMatchObject({
      nextCursor: "next-page"
    });
    await expect(handlers.get("learning:counts")?.({})).resolves.toEqual({
      active: 1,
      trashed: 0,
      progress: { new: 1, studying: 0, familiar: 0, strong: 0 }
    });
    await expect(handlers.get("learning:get")?.({}, item.id)).resolves.toEqual(item);
    await expect(handlers.get("learning:update")?.({}, updateInput)).resolves.toEqual(item);
    await expect(handlers.get("learning:trash")?.({}, item.id))
      .resolves.toMatchObject({ status: "trashed" });
    await expect(handlers.get("learning:restore")?.({}, item.id)).resolves.toEqual(item);
    await expect(handlers.get("learning:empty-trash")?.({})).resolves.toEqual({ deleted: 1 });
    await expect(handlers.get("learning:select-representative-image")?.({}, item.id))
      .resolves.toEqual({ status: "updated", item });
    await expect(handlers.get("learning:set-representative-image-from-url")?.(
      {},
      item.id,
      "https://images.example/ibex.webp"
    )).resolves.toEqual(item);
    await expect(handlers.get("learning:remove-representative-image")?.({}, item.id))
      .resolves.toEqual(item);

    expect(library.listItemPage).toHaveBeenCalledWith(listInput);
    expect(library.countItems).toHaveBeenCalledOnce();
    expect(library.updateItem).toHaveBeenCalledWith(updateInput);
    expect(representativeImages.select).toHaveBeenCalledWith(item.id);
    expect(representativeImages.setFromUrl).toHaveBeenCalledWith(
      item.id,
      "https://images.example/ibex.webp"
    );
    expect(representativeImages.remove).toHaveBeenCalledWith(item.id);
  });

  it("rejects malformed cross-process data before repository calls", () => {
    const { handlers, library, representativeImages } = setup();

    expect(() => handlers.get("learning:list")?.({}, {
      status: "active",
      studyStatus: "mastered",
      sort: "recent"
    })).toThrow(/Invalid Learning Library query/);
    expect(() => handlers.get("learning:list")?.({}, {
      status: "active",
      progressStatus: "mastered",
      sort: "recent"
    })).toThrow(/Invalid Learning Library query/);
    expect(() => handlers.get("learning:list")?.({}, {
      status: "active",
      language: "fr",
      sort: "recent"
    })).toThrow(/Invalid Learning Library query/);
    expect(() => handlers.get("learning:get")?.({}, "")).toThrow(/learning-item request/);
    expect(() => handlers.get("learning:update")?.({}, {
      itemId: item.id,
      title: item.title,
      itemType: "sentence",
      language: "en" as const,
      cefr: "B2",
      sense: item.sense,
      markdownContent: item.markdownContent
    })).toThrow(/learning-item update/);
    expect(() => handlers.get("learning:update")?.({}, {
      itemId: item.id,
      title: item.title,
      itemType: item.itemType,
      language: "fr",
      cefr: item.cefr,
      sense: item.sense,
      markdownContent: item.markdownContent
    })).toThrow(/learning-item update/);
    expect(() => handlers.get("learning:trash")?.({}, " ")).toThrow(
      /learning-item deletion/
    );
    expect(() => handlers.get("learning:restore")?.({}, null)).toThrow(
      /learning-item restore/
    );
    expect(() => handlers.get("learning:select-representative-image")?.({}, " "))
      .toThrow(/representative image/);
    expect(() => handlers.get("learning:set-representative-image-from-url")?.(
      {},
      item.id,
      ""
    )).toThrow(/representative image URL/);
    expect(() => handlers.get("learning:remove-representative-image")?.({}, null))
      .toThrow(/representative image/);

    expect(library.listItemPage).not.toHaveBeenCalled();
    expect(library.updateItem).not.toHaveBeenCalled();
    expect(library.trashItem).not.toHaveBeenCalled();
    expect(library.restoreItem).not.toHaveBeenCalled();
    expect(representativeImages.select).not.toHaveBeenCalled();
    expect(representativeImages.setFromUrl).not.toHaveBeenCalled();
    expect(representativeImages.remove).not.toHaveBeenCalled();
  });
});
