import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  LearningDesktopApi,
  LearningItem,
  LearningItemListInput
} from "../shared/learning-contracts";
import { LearningLibraryWorkspace } from "./LearningLibraryWorkspace";

const activeItems: LearningItem[] = [
  {
    id: "item-bank",
    title: "bank",
    itemType: "word",
    cefr: "A2",
    sense: "side of a river",
    markdownContent: [
      "## Meaning",
      "河岸。",
      "",
      "[unsafe](javascript:alert('x'))",
      "<script>alert('unsafe')</script>",
      "",
      "## Examples",
      "1. We sat on the bank."
    ].join("\n"),
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    trashedAt: null
  },
  {
    id: "item-phrase",
    title: "take for granted",
    itemType: "phrase",
    cefr: "B2",
    sense: "fail to appreciate",
    markdownContent: "## Meaning\n視為理所當然。",
    status: "active",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    trashedAt: null
  }
];

const trashedItem: LearningItem = {
  ...activeItems[0],
  id: "item-trashed",
  status: "trashed",
  trashedAt: "2026-01-03T00:00:00.000Z"
};

function api() {
  const listItems = vi.fn(async (input: LearningItemListInput) => {
    if (input.status === "trashed") return [trashedItem];
    return activeItems.filter((item) => {
      const search = input.search?.toLowerCase() ?? "";
      return (!search || item.title.toLowerCase().includes(search)) &&
        (!input.itemType || item.itemType === input.itemType) &&
        (!input.cefr || item.cefr === input.cefr);
    });
  });
  return {
    listItems,
    getItem: vi.fn(async (itemId: string) =>
      [...activeItems, trashedItem].find((item) => item.id === itemId) ?? activeItems[0]
    ),
    updateItem: vi.fn(async (input) => ({
      ...activeItems[0],
      ...input,
      id: input.itemId,
      updatedAt: "2026-01-04T00:00:00.000Z"
    })),
    trashItem: vi.fn(async () => ({ ...activeItems[0], status: "trashed" as const })),
    restoreItem: vi.fn(async () => ({ ...trashedItem, status: "active" as const })),
    emptyTrash: vi.fn(async () => ({ deleted: 1 }))
  } satisfies LearningDesktopApi;
}

describe("LearningLibraryWorkspace", () => {
  it("loads cards and combines title, type, CEFR, and sort controls", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);

    expect(await screen.findByRole("button", { name: /bank/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /垃圾桶/ }).querySelector("svg"))
      .toBeInTheDocument();
    const scrollRegion = screen.getByTestId("learning-library-scroll-region");
    expect(scrollRegion).not.toContainElement(
      screen.getByLabelText("生詞庫查詢與篩選")
    );
    expect(scrollRegion).toContainElement(screen.getByLabelText("學習項目清單"));
    fireEvent.change(screen.getByRole("searchbox", { name: "搜尋卡片標題" }), {
      target: { value: "take" }
    });
    fireEvent.change(screen.getByLabelText("類型"), {
      target: { value: "phrase" }
    });
    fireEvent.change(screen.getByLabelText("CEFR"), {
      target: { value: "B2" }
    });
    fireEvent.change(screen.getByLabelText("排序"), {
      target: { value: "alphabetical" }
    });

    await waitFor(() => expect(learning.listItems).toHaveBeenCalledWith({
      status: "active",
      search: "take",
      itemType: "phrase",
      cefr: "B2",
      sort: "alphabetical"
    }));
    expect(await screen.findByRole("button", { name: /take for granted/ }))
      .toBeInTheDocument();
  });

  it("opens a centered safe Markdown detail and closes only at modal boundaries", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);
    const trigger = await screen.findByRole("button", { name: /bank/ });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "bank" });
    expect(within(dialog).getByRole("heading", { name: "Meaning" }))
      .toBeInTheDocument();
    expect(within(dialog).queryByText("alert('unsafe')")).not.toBeInTheDocument();
    const unsafeLink = within(dialog).getByText("unsafe").closest("a");
    expect(unsafeLink).not.toHaveAttribute("href", expect.stringContaining("javascript:"));

    fireEvent.mouseDown(dialog);
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("learning-detail-backdrop"));
    expect(screen.queryByRole("dialog", { name: "bank" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "bank" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "bank" })).not.toBeInTheDocument();
  });

  it("edits structured fields and Markdown while cancel leaves data untouched", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);
    fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
    fireEvent.click(await screen.findByRole("button", { name: "編輯" }));

    fireEvent.change(screen.getByLabelText("標題"), {
      target: { value: "river bank" }
    });
    fireEvent.change(screen.getByLabelText("Markdown 內容"), {
      target: { value: "## Meaning\n河岸地帶。" }
    });
    expect(screen.getByLabelText("Markdown 預覽")).toHaveTextContent("河岸地帶");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();
    expect(learning.updateItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "編輯" }));
    fireEvent.change(screen.getByLabelText("標題"), {
      target: { value: "river bank" }
    });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(learning.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-bank", title: "river bank" })
    ));
  });

  it("moves cards to trash, restores individually, and confirms permanent empty", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);
    fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
    await screen.findByRole("dialog", { name: "bank" });
    fireEvent.click(screen.getByRole("button", { name: "刪除" }));
    await waitFor(() => expect(learning.trashItem).toHaveBeenCalledWith("item-bank"));

    fireEvent.click(screen.getByRole("button", { name: /垃圾桶/ }));
    expect(await screen.findByText("side of a river")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "還原 bank" }));
    await waitFor(() => expect(learning.restoreItem).toHaveBeenCalledWith("item-trashed"));

    fireEvent.click(screen.getByRole("button", { name: "清空垃圾桶" }));
    const confirmation = screen.getByRole("dialog", { name: "永久清空垃圾桶？" });
    expect(confirmation).toHaveTextContent("無法復原");
    fireEvent.click(within(confirmation).getByRole("button", { name: "取消" }));
    expect(learning.emptyTrash).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "清空垃圾桶" }));
    fireEvent.click(within(
      screen.getByRole("dialog", { name: "永久清空垃圾桶？" })
    ).getByRole("button", { name: "永久清空" }));
    await waitFor(() => expect(learning.emptyTrash).toHaveBeenCalledOnce());
  });
});
