import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  LearningDesktopApi,
  LearningItem,
  LearningItemListInput,
  LearningItemSummary
} from "../shared/learning-contracts";
import type { ReviewDesktopApi } from "../shared/review-contracts";
import {
  LearningItemDialog,
  LearningMemoryTip,
  LearningLibraryWorkspace
} from "./LearningLibraryWorkspace";

const activeItems: LearningItem[] = [
  {
    id: "item-bank",
    title: "bank",
    itemType: "word",
      language: "en" as const,
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
    cautionNote: "注意：bank 在這裡是河岸，不是金融機構。",
    memoryTip: "想像河水被兩邊的岸夾在中間；那條貼著水邊的土地就是 bank。",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    trashedAt: null
  },
  {
    id: "item-phrase",
    title: "take for granted",
    itemType: "phrase",
      language: "en" as const,
    cefr: "B2",
    sense: "fail to appreciate",
    markdownContent: "## Meaning\n視為理所當然。",
    cautionNote: "",
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

function summary(
  item: LearningItem,
  studyStatus: LearningItemSummary["studyStatus"],
  nextDueAt: string | null
): LearningItemSummary {
  const {
    markdownContent: _markdownContent,
    cautionNote: _cautionNote,
    ...fields
  } = item;
  return { ...fields, studyStatus, nextDueAt };
}

const activeLibraryItems: LearningItemSummary[] = [
  summary(activeItems[0], "due", "2026-07-24T08:00:00.000Z"),
  summary(
    activeItems[1],
    "scheduled",
    new Date(Date.now() + 2 * 86_400_000).toISOString()
  )
];

const trashedLibraryItem = summary(trashedItem, "new", null);

function api() {
  const listItems = vi.fn<LearningDesktopApi["listItems"]>(async (input) => {
    if (input.status === "trashed") {
      return { items: [trashedLibraryItem], nextCursor: null };
    }
    const filtered = activeLibraryItems.filter((item) => {
      const search = input.search?.toLowerCase() ?? "";
      return (!search || item.title.toLowerCase().includes(search)) &&
        (!input.itemType || item.itemType === input.itemType) &&
        (!input.language || item.language === input.language) &&
        (!input.cefr || item.cefr === input.cefr) &&
        (!input.studyStatus || item.studyStatus === input.studyStatus) &&
        (!("progressStatus" in input) || input.progressStatus !== "familiar" ||
          item.id === "item-bank");
    });
    const items = input.sort === "alphabetical"
      ? filtered.toSorted((left, right) => left.title.localeCompare(right.title))
      : filtered;
    return { items, nextCursor: null };
  });
  return {
    listItems,
    countItems: vi.fn(async () => ({
      active: 2,
      trashed: 1,
      progress: { new: 0, studying: 0, familiar: 1, strong: 1 }
    })),
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

describe("LearningMemoryTip", () => {
  it("renders spelling emphasis as safe inline Markdown instead of raw markers", () => {
    render(
      <LearningMemoryTip>
        {[
          "把 **heave** 和 **heavy** 綁在一起：兩字都有 **HEAV-**。",
          "[reference](https://example.com) ![hidden](https://example.com/a.png)",
          "<script>alert('unsafe')</script>"
        ].join("\n")}
      </LearningMemoryTip>
    );

    const note = screen.getByRole("note", { name: "Memory tip" });
    expect(within(note).getByText("heave").tagName).toBe("STRONG");
    expect(within(note).getByText("heavy").tagName).toBe("STRONG");
    expect(within(note).getByText("HEAV-").tagName).toBe("STRONG");
    expect(note).not.toHaveTextContent("**");
    expect(note.querySelector("a, img, script")).not.toBeInTheDocument();
    expect(note).toHaveTextContent("reference");
    expect(note).not.toHaveTextContent("alert('unsafe')");
  });
});

describe("LearningLibraryWorkspace", () => {
  it("does not expose a language filter inside an isolated workspace", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);

    await screen.findByText("bank");
    expect(screen.queryByLabelText("Language", { selector: "select" }))
      .not.toBeInTheDocument();
    expect(learning.listItems).toHaveBeenCalledWith(
      expect.not.objectContaining({ language: expect.anything() })
    );
  });
  it("shows image management only in edit mode and accepts device or URL sources", async () => {
    const originalImage = "data:image/jpeg;base64,b2xk";
    const replacementImage = "data:image/jpeg;base64,bmV3";
    const imageItem = {
      ...activeItems[0],
      representativeImageDataUrl: originalImage
    } as LearningItem;
    const learning = Object.assign(api(), {
      selectRepresentativeImage: vi.fn(async () => ({
        status: "updated" as const,
        item: { ...imageItem, representativeImageDataUrl: replacementImage }
      })),
      setRepresentativeImageFromUrl: vi.fn(async () => ({
        ...imageItem,
        representativeImageDataUrl: replacementImage
      })),
      removeRepresentativeImage: vi.fn(async () => ({
        ...imageItem,
        representativeImageDataUrl: null
      }))
    });
    const onChanged = vi.fn(async () => undefined);
    const { rerender } = render(
      <LearningItemDialog
        item={imageItem}
        api={learning as LearningDesktopApi}
        onChanged={onChanged}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("img", {
      name: "Representative image for bank: side of a river"
    })).toHaveAttribute("src", originalImage);
    expect(screen.queryByRole("button", { name: "Replace" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", {
      name: "Replace representative image from device"
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "Replace representative image from device"
    }));
    await waitFor(() => expect(learning.selectRepresentativeImage)
      .toHaveBeenCalledWith("item-bank"));
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({
      representativeImageDataUrl: replacementImage
    }));

    fireEvent.click(screen.getByRole("button", { name: "From URL" }));
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "https://images.example/bank.png" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(learning.setRepresentativeImageFromUrl)
      .toHaveBeenCalledWith("item-bank", "https://images.example/bank.png"));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Remove image?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(learning.removeRepresentativeImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(within(
      screen.getByRole("alertdialog", { name: "Remove image?" })
    ).getByRole("button", { name: "Remove image" }));
    await waitFor(() => expect(learning.removeRepresentativeImage)
      .toHaveBeenCalledWith("item-bank"));

    rerender(
      <LearningItemDialog
        item={imageItem}
        api={learning as LearningDesktopApi}
        readOnly
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("img", {
      name: "Representative image for bank: side of a river"
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" }))
      .not.toBeInTheDocument();
  });

  it("does not offer AI editing from a read-only learning-item detail", () => {
    const learning = Object.assign(api(), {
      aiEdit: {
        start: vi.fn(),
        send: vi.fn(),
        stop: vi.fn(),
        apply: vi.fn(),
        discard: vi.fn()
      }
    });
    render(
      <LearningItemDialog
        item={activeItems[0]}
        api={learning as LearningDesktopApi}
        readOnly
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Edit with AI" }))
      .not.toBeInTheDocument();
  });

  it("shows compact review status and history in learning item detail", async () => {
    const reviewApi = {
      getSummary: vi.fn(),
      generatePaper: vi.fn(),
      gradePaper: vi.fn(),
      confirmPaper: vi.fn(),
      discardPaper: vi.fn(),
      getItemDetail: vi.fn(async () => ({
        status: "scheduled" as const,
        lastReviewedAt: "2026-07-24T08:00:00.000Z",
        lastFinalRating: "good" as const,
        nextDueAt: "2026-07-26T08:00:00.000Z",
        reviewCount: 3,
        history: [{
          id: "event-1",
          sessionId: "session-1",
          itemId: activeItems[0].id,
          reviewedAt: "2026-07-24T08:00:00.000Z",
          aiRating: "easy" as const,
          finalRating: "good" as const,
          answer: "金融機構\n提供存款與貸款服務",
          intervalSeconds: 172800,
          nextDueAt: "2026-07-26T08:00:00.000Z"
        }, {
          id: "event-2",
          sessionId: "session-2",
          itemId: activeItems[0].id,
          reviewedAt: "2026-07-23T08:00:00.000Z",
          aiRating: "forgotten" as const,
          finalRating: "forgotten" as const,
          answer: "",
          intervalSeconds: 600,
          nextDueAt: "2026-07-23T08:10:00.000Z"
        }, {
          id: "event-3",
          sessionId: "session-3",
          itemId: activeItems[0].id,
          reviewedAt: "2026-07-22T08:00:00.000Z",
          aiRating: "hard" as const,
          finalRating: "hard" as const,
          answer: null,
          intervalSeconds: 86400,
          nextDueAt: "2026-07-23T08:00:00.000Z"
        }]
      })),
      onGenerationProgress: vi.fn(() => () => undefined)
    } satisfies ReviewDesktopApi;
    render(<LearningLibraryWorkspace api={api()} reviewApi={reviewApi} />);

    fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
    const dialog = await screen.findByRole("dialog", { name: "bank" });
    expect(within(dialog).getByLabelText("Learning caution")).toHaveTextContent(
      "bank 在這裡是河岸"
    );
    const memoryTip = within(dialog).getByRole("note", { name: "Memory tip" });
    expect(memoryTip).toHaveTextContent("河水被兩邊的岸夾在中間");
    expect(memoryTip.querySelector("svg")).toBeInTheDocument();
    const schedule = within(dialog).getByRole("region", { name: "Review schedule" });
    const scrollRegion = dialog.querySelector(".learning-dialog-scroll");
    expect(scrollRegion).toContainElement(schedule);
    expect(scrollRegion).toContainElement(dialog.querySelector(".learning-dialog-content"));
    expect(await within(schedule).findByText("Scheduled")).toBeInTheDocument();
    expect(within(schedule).getByText("Good", { selector: "dd" }))
      .toBeInTheDocument();
    fireEvent.click(within(schedule).getByText("View review history"));
    const historyItems = within(schedule).getAllByRole("listitem");
    expect(within(historyItems[0]).getByText("Good")).toHaveAttribute(
      "data-rating",
      "good"
    );
    expect(within(historyItems[0]).queryByText(/AI Easy|Final Good/))
      .not.toBeInTheDocument();
    const savedAnswer = within(historyItems[0]).getByText(/金融機構/)
      .closest(".learning-review-answer");
    expect(savedAnswer).toHaveAttribute("data-answer-state", "saved");
    expect(savedAnswer).toHaveTextContent(
      /金融機構\s+提供存款與貸款服務/
    );
    expect(within(historyItems[1]).getByText("Not answered")
      .closest(".learning-review-answer"))
      .toHaveAttribute("data-answer-state", "empty");
    expect(within(historyItems[2]).getByText("Answer wasn't saved")
      .closest(".learning-review-answer"))
      .toHaveAttribute("data-answer-state", "unavailable");
  });

  it("loads cards and combines title, type, CEFR, and sort controls", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);

    expect(await screen.findByRole("button", { name: /bank/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trash/ }).querySelector("svg"))
      .toBeInTheDocument();
    const scrollRegion = screen.getByTestId("learning-library-scroll-region");
    expect(scrollRegion).not.toContainElement(
      screen.getByLabelText("Learning Library search and filters")
    );
    expect(scrollRegion).toContainElement(screen.getByLabelText("Learning item list"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search card titles" }), {
      target: { value: "take" }
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "phrase" }
    });
    fireEvent.change(screen.getByLabelText("CEFR"), {
      target: { value: "B2" }
    });
    fireEvent.change(screen.getByLabelText("Sort"), {
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

  it("never sends a language query from the workspace-local library", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);
    await screen.findByRole("button", { name: /bank/ });

    expect(screen.queryByLabelText("Language", { selector: "select" }))
      .not.toBeInTheDocument();
    expect(learning.listItems.mock.calls.every(([input]) =>
      !("language" in input)
    )).toBe(true);
  });

  it("automatically appends the next page near the bottom without result counts", async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    try {
      const learning = api();
      learning.listItems.mockImplementation(async (input) => input.cursor
        ? { items: [activeLibraryItems[1]], nextCursor: null }
        : { items: [activeLibraryItems[0]], nextCursor: "page-2" });
      render(<LearningLibraryWorkspace api={learning} />);

      expect(await screen.findByRole("button", { name: /bank/ }))
        .toBeInTheDocument();
      expect(screen.queryByText(/Showing \d+/)).not.toBeInTheDocument();

      act(() => {
        intersectionCallback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });

      expect(await screen.findByRole("button", { name: /take for granted/ }))
        .toBeInTheDocument();
      expect(learning.listItems).toHaveBeenCalledWith(expect.objectContaining({
        status: "active",
        sort: "recent",
        cursor: "page-2"
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("automatically pages through Trash with the same bounded flow", async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    try {
      const secondTrashItem = {
        ...trashedLibraryItem,
        id: "item-trashed-2",
        title: "second trashed item"
      };
      const learning = api();
      learning.countItems.mockResolvedValue({
        active: 2,
        trashed: 2,
        progress: { new: 0, studying: 0, familiar: 1, strong: 1 }
      });
      learning.listItems.mockImplementation(async (input) => {
        if (input.status === "active") {
          return { items: activeLibraryItems, nextCursor: null };
        }
        return input.cursor
          ? { items: [secondTrashItem], nextCursor: null }
          : { items: [trashedLibraryItem], nextCursor: "trash-page-2" };
      });
      render(<LearningLibraryWorkspace api={learning} />);
      await screen.findByRole("button", { name: /bank/ });
      fireEvent.click(screen.getByRole("button", { name: /Trash/ }));
      expect(await screen.findByRole("button", { name: "Restore bank" }))
        .toBeInTheDocument();

      act(() => {
        intersectionCallback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });

      expect(await screen.findByRole("button", {
        name: "Restore second trashed item"
      })).toBeInTheDocument();
      expect(learning.listItems).toHaveBeenCalledWith({
        status: "trashed",
        sort: "recent",
        cursor: "trash-page-2"
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps mounted learning-item cards bounded while retaining a large loaded page", async () => {
    const learning = api();
    const manyItems = Array.from({ length: 50 }, (_, index) => ({
      ...activeLibraryItems[0],
      id: `bounded-${index}`,
      title: `bounded item ${index}`
    }));
    learning.listItems.mockResolvedValue({
      items: manyItems,
      nextCursor: null
    });

    const { container } = render(<LearningLibraryWorkspace api={learning} />);
    const focused = await screen.findByRole("button", { name: /bounded item 0/ });

    let mounted = container.querySelectorAll(".learning-item-card");
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(50);

    focused.focus();
    const scrollRegion = screen.getByTestId("learning-library-scroll-region");
    scrollRegion.scrollTop = 2_000;
    fireEvent.scroll(scrollRegion);
    expect(screen.getByRole("button", { name: /bounded item 0/ })).toHaveFocus();
    mounted = container.querySelectorAll(".learning-item-card");
    expect(mounted.length).toBeLessThan(50);
  });

  it("keeps loaded cards visible and retries a failed automatic page", async () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    try {
      const learning = api();
      let pageAttempts = 0;
      learning.listItems.mockImplementation(async (input) => {
        if (!input.cursor) {
          return { items: [activeLibraryItems[0]], nextCursor: "page-2" };
        }
        pageAttempts += 1;
        if (pageAttempts === 1) throw new Error("temporary page failure");
        return { items: [activeLibraryItems[1]], nextCursor: null };
      });
      render(<LearningLibraryWorkspace api={learning} />);
      expect(await screen.findByRole("button", { name: /bank/ }))
        .toBeInTheDocument();

      act(() => {
        intersectionCallback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });

      const error = await screen.findByRole("alert");
      expect(error).toHaveTextContent("Couldn’t load more");
      expect(screen.getByRole("button", { name: /bank/ })).toBeInTheDocument();
      fireEvent.click(within(error).getByRole("button", { name: "Retry" }));
      expect(await screen.findByRole("button", { name: /take for granted/ }))
        .toBeInTheDocument();
      expect(pageAttempts).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores a stale response after filters start a newer query", async () => {
    let resolveStale: ((value: Awaited<ReturnType<LearningDesktopApi["listItems"]>>) => void) |
      undefined;
    const stale = new Promise<Awaited<ReturnType<LearningDesktopApi["listItems"]>>>(
      (resolve) => {
        resolveStale = resolve;
      }
    );
    const freshItem = {
      ...activeLibraryItems[0],
      id: "fresh-query",
      title: "fresh query"
    };
    const staleItem = {
      ...activeLibraryItems[0],
      id: "stale-query",
      title: "stale query"
    };
    const learning = api();
    learning.listItems.mockImplementation(async (input) => {
      if (input.itemType === "word" && !input.cefr) return stale;
      if (input.itemType === "word" && input.cefr === "A1") {
        return { items: [freshItem], nextCursor: null };
      }
      return { items: activeLibraryItems, nextCursor: null };
    });
    render(<LearningLibraryWorkspace api={learning} />);
    await screen.findByRole("button", { name: /bank/ });

    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "word" }
    });
    await waitFor(() => expect(learning.listItems).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: "word" })
    ));
    fireEvent.change(screen.getByLabelText("CEFR"), {
      target: { value: "A1" }
    });
    expect(await screen.findByRole("button", { name: /fresh query/ }))
      .toBeInTheDocument();

    await act(async () => {
      resolveStale?.({ items: [staleItem], nextCursor: null });
      await stale;
    });
    expect(screen.queryByRole("button", { name: /stale query/ }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fresh query/ }))
      .toBeInTheDocument();
  });

  it("shows compact progress counts and uses them for progress filtering", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);

    const overview = await screen.findByRole("group", {
      name: "Learning item progress counts"
    });
    const familiarFilter = await within(overview).findByRole("button", {
      name: "Familiar, 1 learning item"
    });
    expect(within(overview).getByRole("button", {
      name: "New, 0 learning items"
    })).toBeInTheDocument();
    expect(within(overview).getByRole("button", {
      name: "Studying, 0 learning items"
    })).toBeInTheDocument();
    expect(within(overview).getByRole("button", {
      name: "Strong, 1 learning item"
    })).toBeInTheDocument();
    expect(screen.queryByLabelText("Study status")).not.toBeInTheDocument();
    expect(familiarFilter).toHaveAttribute("aria-pressed", "false");

    const dueCard = await screen.findByRole("button", {
      name: /bank, Due/
    });
    const scheduledCard = screen.getByRole("button", {
      name: /take for granted, scheduled, in 2 days/
    });
    expect(dueCard).toHaveAttribute("data-study-status", "due");
    expect(scheduledCard).toHaveAttribute("data-study-status", "scheduled");
    expect(within(dueCard).getByText("Due")).toBeInTheDocument();
    expect(within(scheduledCard).getByText("in 2 days")).toHaveAttribute(
      "title",
      "Scheduled; next review in 2 days"
    );

    fireEvent.click(familiarFilter);
    await waitFor(() => expect(learning.listItems).toHaveBeenCalledWith({
      status: "active",
      search: "",
      progressStatus: "familiar",
      sort: "recent"
    }));
    expect(screen.getByRole("button", { name: /bank, Due/ }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take for granted/ }))
      .not.toBeInTheDocument();
    expect(familiarFilter).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(familiarFilter);
    await waitFor(() => {
      const latest = learning.listItems.mock.calls.at(-1)?.[0];
      expect(latest).not.toHaveProperty("progressStatus");
    });
    expect(familiarFilter).toHaveAttribute("aria-pressed", "false");

    fireEvent.change(screen.getByLabelText("Sort"), {
      target: { value: "study-status" }
    });
    await waitFor(() => expect(learning.listItems).toHaveBeenCalledWith({
      status: "active",
      search: "",
      sort: "study-status"
    }));
  });

  it("shows exact nearby days and progressively coarser future intervals", async () => {
    const learning = api();
    const dayOffsets = [1, 2, 7, 8, 14, 30, 365];
    const scheduledItems = dayOffsets.map((days, index) => {
      const due = new Date();
      due.setDate(due.getDate() + days);
      due.setHours(12, 0, 0, 0);
      return {
        ...activeLibraryItems[0],
        id: `scheduled-${days}`,
        title: `card-${index}`,
        studyStatus: "scheduled" as const,
        nextDueAt: due.toISOString()
      };
    });
    learning.listItems.mockImplementation(async (input) => ({
      items: input.status === "active" ? scheduledItems : [],
      nextCursor: null
    }));

    render(<LearningLibraryWorkspace api={learning} />);

    for (const label of [
      "tomorrow",
      "in 2 days",
      "in 7 days",
      "in about 1 weeks",
      "in about 2 weeks",
      "in about 1 months",
      "in about 1 years"
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(within(screen.getByRole("group", {
      name: "Learning item progress counts"
    })).getByRole("button", { name: "Strong, 1 learning item" }))
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

  it("plays an English pronunciation for both words and phrases", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    class MockSpeechSynthesisUtterance {
      text: string;
      lang = "";
      voice: SpeechSynthesisVoice | null = null;
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("speechSynthesis", {
      cancel,
      getVoices: () => [],
      speak
    });
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);

    try {
      const learning = api();
      render(<LearningLibraryWorkspace api={learning} />);
      fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
      const pronounce = await screen.findByRole("button", {
        name: "Play pronunciation of bank"
      });

      fireEvent.click(pronounce);

      expect(cancel).toHaveBeenCalled();
      expect(speak).toHaveBeenCalledOnce();
      expect(speak.mock.calls[0][0]).toMatchObject({
        text: "bank",
        lang: "en-US",
        rate: 0.85,
        pitch: 1
      });

      fireEvent.click(screen.getByRole("button", { name: "Close card details" }));
      fireEvent.click(screen.getByRole("button", { name: /take for granted/ }));
      expect(await screen.findByRole("dialog", { name: "take for granted" }))
        .toBeInTheDocument();
      const pronouncePhrase = screen.getByRole("button", {
        name: "Play pronunciation of take for granted"
      });
      fireEvent.click(pronouncePhrase);
      expect(speak).toHaveBeenCalledTimes(2);
      expect(speak.mock.calls[1][0]).toMatchObject({
        text: "take for granted",
        lang: "en-US",
        rate: 0.85,
        pitch: 1
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("routes each learning item language without forcing non-English text through an English voice", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const englishVoice = {
      default: true,
      lang: "en-US",
      localService: true,
      name: "English",
      voiceURI: "English"
    } as SpeechSynthesisVoice;
    const japaneseVoice = {
      default: false,
      lang: "ja-JP",
      localService: true,
      name: "Japanese",
      voiceURI: "Japanese"
    } as SpeechSynthesisVoice;
    const simplifiedChineseVoice = {
      default: false,
      lang: "zh-CN",
      localService: true,
      name: "Simplified Chinese",
      voiceURI: "Simplified Chinese"
    } as SpeechSynthesisVoice;
    const traditionalChineseVoice = {
      default: false,
      lang: "zh-Hant-HK",
      localService: true,
      name: "Traditional Chinese",
      voiceURI: "Traditional Chinese"
    } as SpeechSynthesisVoice;
    class MockSpeechSynthesisUtterance {
      text: string;
      lang = "";
      voice: SpeechSynthesisVoice | null = null;
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("speechSynthesis", {
      cancel,
      getVoices: () => [
        englishVoice,
        japaneseVoice,
        simplifiedChineseVoice,
        traditionalChineseVoice
      ],
      speak
    });
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);

    try {
      const view = render(
        <LearningItemDialog
          item={{ ...activeItems[0], title: "ロシア", language: "ja" }}
          api={api()}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole("button", {
        name: "Play pronunciation of ロシア"
      }));

      expect(speak).toHaveBeenCalledOnce();
      expect(speak.mock.calls[0][0]).toMatchObject({
        text: "ロシア",
        lang: "ja-JP",
        voice: japaneseVoice
      });

      view.rerender(
        <LearningItemDialog
          item={{ ...activeItems[0], title: "俄羅斯", language: "zh-TW" }}
          api={api()}
          onClose={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole("button", {
        name: "Play pronunciation of 俄羅斯"
      }));
      expect(speak.mock.calls[1][0]).toMatchObject({
        text: "俄羅斯",
        lang: "zh-Hant-HK",
        voice: traditionalChineseVoice
      });

      view.rerender(
        <LearningItemDialog
          item={{ ...activeItems[0], title: "Россия", language: "other" }}
          api={api()}
          onClose={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole("button", {
        name: "Play pronunciation of Россия"
      }));
      expect(speak.mock.calls[2][0]).toMatchObject({
        text: "Россия",
        lang: "",
        voice: null
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("edits structured fields and Markdown while cancel leaves data untouched", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);
    fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
    const scrollRegion = screen.getByTestId("learning-library-scroll-region");
    scrollRegion.scrollTop = 420;
    fireEvent.scroll(scrollRegion);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "river bank" }
    });
    fireEvent.change(screen.getByLabelText("Markdown content"), {
      target: { value: "## Meaning\n河岸地帶。" }
    });
    fireEvent.change(screen.getByLabelText("Learning caution"), {
      target: { value: "不要與金融機構的 bank 混淆。" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Memory tip" }), {
      target: { value: "想像河水被左右兩道岸穩穩夾住。" }
    });
    expect(screen.getByLabelText("Markdown preview")).toHaveTextContent("河岸地帶");
    expect(screen.getByLabelText("Learning caution preview")).toHaveTextContent(
      "不要與金融機構"
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();
    expect(learning.updateItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "river bank" }
    });
    fireEvent.change(within(
      screen.getByRole("dialog", { name: "bank" })
    ).getByLabelText("Language"), {
      target: { value: "ja" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(learning.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-bank",
        title: "river bank",
        language: "ja",
        cautionNote: "注意：bank 在這裡是河岸，不是金融機構。",
        memoryTip: "想像河水被兩邊的岸夾在中間；那條貼著水邊的土地就是 bank。"
      })
    ));
    await waitFor(() => expect(scrollRegion.scrollTop).toBe(420));
  });

  it("updates one in-place AI draft and saves it only after explicit apply", async () => {
    const learning = api();
    const aiEdit = {
      start: vi.fn(async () => ({
        sessionId: "edit-1",
        itemId: "item-bank",
        phase: "ready" as const,
        draft: {
          markdownContent: activeItems[0].markdownContent,
          cautionNote: activeItems[0].cautionNote ?? ""
        },
        hasChanges: false,
        status: "Tell AI what to change."
      })),
      send: vi.fn(async () => ({
        sessionId: "edit-1",
        itemId: "item-bank",
        phase: "ready" as const,
        draft: {
          markdownContent: "## Meaning\n損害或削弱。\n\n## impair vs. repair\n兩者意思相反。",
          cautionNote: "impair 是削弱；repair 是修復。"
        },
        hasChanges: true,
        status: "Draft updated. You can ask for another adjustment."
      })),
      stop: vi.fn(),
      apply: vi.fn(async () => ({
        ...activeItems[0],
        markdownContent: "## Meaning\n損害或削弱。\n\n## impair vs. repair\n兩者意思相反。",
        cautionNote: "impair 是削弱；repair 是修復。"
      })),
      discard: vi.fn(async () => undefined)
    };
    Object.assign(learning, { aiEdit });
    render(<LearningLibraryWorkspace api={learning as LearningDesktopApi} />);

    fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit with AI" }));
    expect(aiEdit.start).toHaveBeenCalledWith("item-bank");
    expect(screen.queryByText("AI conversation history")).not.toBeInTheDocument();
    const request = await screen.findByLabelText("AI editing request");
    expect(screen.queryByText("AI editing request")).not.toBeInTheDocument();
    expect(screen.queryByText("Describe one change at a time")).not.toBeInTheDocument();
    expect(screen.queryByText("Ctrl/⌘ + Enter")).not.toBeInTheDocument();
    expect(screen.queryByText("Ready", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply AI edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    fireEvent.change(request, {
      target: { value: "我常把 impair 誤解成 repair，請補充兩者差異。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send AI edit request" }));

    expect(await screen.findByLabelText("Learning caution")).toHaveTextContent(
      "impair 是削弱"
    );
    expect(screen.getByText("兩者意思相反。")).toBeInTheDocument();
    expect(learning.updateItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close card details" }));
    const discardConfirmation = screen.getByRole("alertdialog", {
      name: "Discard AI edit?"
    });
    expect(aiEdit.discard).not.toHaveBeenCalled();
    fireEvent.click(within(discardConfirmation).getByRole("button", {
      name: "Keep editing"
    }));
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply AI edit" }));
    await waitFor(() => expect(aiEdit.apply).toHaveBeenCalledWith("edit-1"));
  });

  it("can stop an in-flight AI edit without discarding the last valid draft", async () => {
    const learning = api();
    let resolveSend: ((snapshot: {
      sessionId: string;
      itemId: string;
      phase: "ready";
      draft: { markdownContent: string; cautionNote: string };
      hasChanges: boolean;
      status: string;
    }) => void) | undefined;
    const aiEdit = {
      start: vi.fn(async () => ({
        sessionId: "edit-stop",
        itemId: "item-bank",
        phase: "ready" as const,
        draft: {
          markdownContent: activeItems[0].markdownContent,
          cautionNote: activeItems[0].cautionNote ?? ""
        },
        hasChanges: false,
        status: "Tell AI what to change."
      })),
      send: vi.fn(() => new Promise((resolve) => {
        resolveSend = resolve;
      })),
      stop: vi.fn(async () => ({
        sessionId: "edit-stop",
        itemId: "item-bank",
        phase: "error" as const,
        draft: {
          markdownContent: activeItems[0].markdownContent,
          cautionNote: activeItems[0].cautionNote ?? ""
        },
        hasChanges: false,
        status: "AI editing stopped. Your last valid draft is unchanged."
      })),
      apply: vi.fn(),
      discard: vi.fn(async () => undefined)
    };
    Object.assign(learning, { aiEdit });
    render(<LearningLibraryWorkspace api={learning as LearningDesktopApi} />);

    fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit with AI" }));
    fireEvent.change(await screen.findByLabelText("AI editing request"), {
      target: { value: "請補充差異。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send AI edit request" }));
    expect(screen.getByLabelText("AI edit in progress")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("learning-detail-backdrop"));
    expect(aiEdit.discard).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close card details" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(aiEdit.discard).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Stop AI edit" }));

    await waitFor(() => expect(aiEdit.stop).toHaveBeenCalledWith("edit-stop"));
    expect(screen.getByRole("status")).toHaveTextContent("last valid draft is unchanged");
    resolveSend?.({
      sessionId: "edit-stop",
      itemId: "item-bank",
      phase: "ready",
      draft: {
        markdownContent: activeItems[0].markdownContent,
        cautionNote: activeItems[0].cautionNote ?? ""
      },
      hasChanges: false,
      status: "Draft updated."
    });
  });

  it("confirms before moving a card to trash, then restores and empties trash", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);
    fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
    await screen.findByRole("dialog", { name: "bank" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const deleteConfirmation = screen.getByRole("alertdialog", {
      name: "Delete “bank”?"
    });
    expect(deleteConfirmation).toHaveTextContent("Move to Trash");
    expect(deleteConfirmation).toHaveTextContent("can be restored later");
    expect(learning.trashItem).not.toHaveBeenCalled();

    fireEvent.click(within(deleteConfirmation).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog", {
      name: "Delete “bank”?"
    })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();
    expect(learning.trashItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog", {
      name: "Delete “bank”?"
    })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(
      screen.getByRole("alertdialog", { name: "Delete “bank”?" })
    ).getByRole("button", { name: "Move to Trash" }));
    await waitFor(() => expect(learning.trashItem).toHaveBeenCalledWith("item-bank"));

    fireEvent.click(screen.getByRole("button", { name: /Trash/ }));
    expect(await screen.findByText("side of a river")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore bank" }));
    await waitFor(() => expect(learning.restoreItem).toHaveBeenCalledWith("item-trashed"));

    fireEvent.click(screen.getByRole("button", { name: "Empty Trash" }));
    const confirmation = screen.getByRole("dialog", {
      name: "Permanently empty Trash?"
    });
    expect(confirmation).toHaveTextContent("cannot be recovered");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(learning.emptyTrash).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Empty Trash" }));
    fireEvent.click(within(
      screen.getByRole("dialog", { name: "Permanently empty Trash?" })
    ).getByRole("button", { name: "Empty permanently" }));
    await waitFor(() => expect(learning.emptyTrash).toHaveBeenCalledOnce());
  });

  it("keeps the detail open and reports an error when moving to trash fails", async () => {
    const learning = api();
    learning.trashItem.mockRejectedValueOnce(new Error("Unable to move to Trash temporarily"));
    render(<LearningLibraryWorkspace api={learning} />);
    fireEvent.click(await screen.findByRole("button", { name: /bank/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(within(
      screen.getByRole("alertdialog", { name: "Delete “bank”?" })
    ).getByRole("button", { name: "Move to Trash" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to move to Trash temporarily");
    expect(screen.getByRole("dialog", { name: "bank" })).toBeInTheDocument();
    expect(learning.trashItem).toHaveBeenCalledOnce();
  });
});
