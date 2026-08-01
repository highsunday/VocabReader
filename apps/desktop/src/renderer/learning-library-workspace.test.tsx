import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  LearningDesktopApi,
  LearningItem,
  LearningItemListInput,
  LearningItemSummary
} from "../shared/learning-contracts";
import type { ReviewDesktopApi } from "../shared/review-contracts";
import { LearningLibraryWorkspace } from "./LearningLibraryWorkspace";

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
  const { markdownContent: _markdownContent, ...fields } = item;
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
        (!input.studyStatus || item.studyStatus === input.studyStatus);
    });
    const items = input.sort === "alphabetical"
      ? filtered.toSorted((left, right) => left.title.localeCompare(right.title))
      : filtered;
    return { items, nextCursor: null };
  });
  return {
    listItems,
    countItems: vi.fn(async () => ({ active: 2, trashed: 1 })),
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

  it("filters active learning items by language and clears the language query", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);
    await screen.findByRole("button", { name: /bank/ });

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ja" }
    });
    await waitFor(() => expect(learning.listItems).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", language: "ja" })
    ));

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "all" }
    });
    await waitFor(() => {
      const latest = learning.listItems.mock.calls.at(-1)?.[0];
      expect(latest).not.toHaveProperty("language");
    });
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
      learning.countItems.mockResolvedValue({ active: 2, trashed: 2 });
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

  it("shows study states and supports status filtering and priority sorting", async () => {
    const learning = api();
    render(<LearningLibraryWorkspace api={learning} />);

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

    fireEvent.change(screen.getByLabelText("Study status"), {
      target: { value: "due" }
    });
    await waitFor(() => expect(learning.listItems).toHaveBeenCalledWith({
      status: "active",
      search: "",
      studyStatus: "due",
      sort: "recent"
    }));
    expect(screen.getByRole("button", { name: /bank, Due/ }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take for granted/ }))
      .not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Study status"), {
      target: { value: "all" }
    });
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
    expect(screen.getByLabelText("Study status")).toHaveTextContent("Scheduled");
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
    expect(screen.getByLabelText("Markdown preview")).toHaveTextContent("河岸地帶");
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
        language: "ja"
      })
    ));
    await waitFor(() => expect(scrollRegion.scrollTop).toBe(420));
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
