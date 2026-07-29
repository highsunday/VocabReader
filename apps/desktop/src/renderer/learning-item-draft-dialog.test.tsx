import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatDesktopApi, ChatSnapshot } from "../shared/chat-contracts";
import type { LearningItemDraftBatch } from "../shared/learning-contracts";
import {
  LearningItemBatchAction,
  LearningItemDraftDialog
} from "./LearningItemDraftDialog";

const batch: LearningItemDraftBatch = {
  id: "batch-a",
  status: "pending",
  drafts: [{
    id: "draft-a",
    title: "reluctant",
    itemType: "word",
    cefr: "B2",
    sense: "unwilling",
    markdownContent: "## Meaning\n不情願。",
    state: "included"
  }, {
    id: "draft-b",
    title: "take for granted",
    itemType: "phrase",
    cefr: "B2",
    sense: "fail to appreciate",
    markdownContent: "## Meaning\n視為理所當然。",
    state: "excluded"
  }],
  existing: [{
    itemId: "item-bank",
    title: "bank",
    sense: "financial institution",
    status: "active"
  }],
  trashed: [{
    itemId: "item-happy",
    title: "happy",
    sense: "feeling pleasure",
    status: "trashed"
  }]
};

const snapshot = {
  messages: []
} as unknown as ChatSnapshot;

function api() {
  return {
    updateLearningItemDraft: vi.fn().mockResolvedValue(snapshot),
    setLearningItemDraftState: vi.fn().mockResolvedValue(snapshot),
    abandonLearningItemBatch: vi.fn().mockResolvedValue(snapshot),
    submitLearningItemBatch: vi.fn().mockResolvedValue(snapshot),
    restoreLearningItemMatch: vi.fn().mockResolvedValue(snapshot)
  } as unknown as ChatDesktopApi;
}

describe("LearningItemDraftDialog", () => {
  it("opens from a batch action and exposes pending and submitted summaries", () => {
    const open = vi.fn();
    const { rerender } = render(
      <LearningItemBatchAction batch={batch} onOpen={open} />
    );

    fireEvent.click(screen.getByRole("button", {
      name: "2 cards awaiting review"
    }));
    expect(open).toHaveBeenCalledWith("batch-a");

    rerender(
      <LearningItemBatchAction
        batch={{
          ...batch,
          status: "submitted",
          createdItemIds: ["created-a"]
        }}
        onOpen={open}
      />
    );
    expect(screen.getByText(/1 added, 2 already existed/)).toBeInTheDocument();
  });

  it("shows read-only previews while preserving exclude, restore and submit actions", async () => {
    const chat = api();
    const changed = vi.fn();
    render(
      <LearningItemDraftDialog
        batch={batch}
        api={chat}
        onClose={vi.fn()}
        onSnapshot={changed}
      />
    );

    expect(screen.getByRole("dialog", { name: "Review cards" }))
      .toBeInTheDocument();
    expect(screen.getByText("Already exists")).toBeInTheDocument();
    expect(screen.getByText("In Trash")).toBeInTheDocument();
    expect(screen.getByText("不情願。")).toBeInTheDocument();
    expect(screen.getByText("視為理所當然。")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Markdown 內容")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Save reluctant 的修改"
    })).not.toBeInTheDocument();

    expect(screen.getByRole("button", {
      name: "Exclude reluctant"
    })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", {
      name: "Exclude reluctant"
    }));
    expect(chat.setLearningItemDraftState)
      .toHaveBeenCalledWith("batch-a", "draft-a", "excluded");
    await waitFor(() => expect(screen.getByRole("button", {
      name: "Restore take for granted"
    })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", {
      name: "Restore take for granted"
    }));
    expect(chat.setLearningItemDraftState)
      .toHaveBeenCalledWith("batch-a", "draft-b", "included");

    await waitFor(() => expect(
      screen.getByRole("button", { name: "Restore happy" })
    ).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Restore happy" }));
    expect(chat.restoreLearningItemMatch)
      .toHaveBeenCalledWith("batch-a", "item-happy");

    await waitFor(() => expect(screen.getByRole("button", {
      name: "Submit cards"
    })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Submit cards" }));
    expect(chat.submitLearningItemBatch).toHaveBeenCalledWith("batch-a");
    expect(chat.updateLearningItemDraft).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before abandoning a pending batch", async () => {
    const chat = api();
    const { rerender } = render(
      <LearningItemDraftDialog
        batch={batch}
        api={chat}
        onClose={vi.fn()}
        onSnapshot={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Discard draft batch"
    }));
    expect(chat.abandonLearningItemBatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {
      name: "Confirm discard"
    }));
    await waitFor(() => expect(chat.abandonLearningItemBatch)
      .toHaveBeenCalledWith("batch-a"));

    rerender(
      <LearningItemDraftDialog
        batch={{ ...batch, status: "abandoned", abandonedAt: 123 }}
        api={chat}
        onClose={vi.fn()}
        onSnapshot={vi.fn()}
      />
    );
    expect(screen.getByText(/This draft batch was discarded/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit cards" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exclude reluctant" }))
      .not.toBeInTheDocument();
  });
});
