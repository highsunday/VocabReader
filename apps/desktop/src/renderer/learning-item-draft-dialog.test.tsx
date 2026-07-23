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
      name: "2 張學習卡片待確認"
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
    expect(screen.getByText(/已新增 1 張/)).toBeInTheDocument();
  });

  it("edits, excludes, restores, submits and restores trash through typed chat actions", async () => {
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

    expect(screen.getByRole("dialog", { name: "確認學習卡片" }))
      .toBeInTheDocument();
    expect(screen.getByText("已存在")).toBeInTheDocument();
    expect(screen.getByText("已在垃圾桶")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("reluctant 標題"), {
      target: { value: "reluctantly" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "儲存 reluctant 的修改"
    }));
    expect(chat.updateLearningItemDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-a",
        draftId: "draft-a",
        title: "reluctantly"
      })
    );

    await waitFor(() => expect(screen.getByRole("button", {
      name: "排除 reluctant"
    })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", {
      name: "排除 reluctant"
    }));
    expect(chat.setLearningItemDraftState)
      .toHaveBeenCalledWith("batch-a", "draft-a", "excluded");
    await waitFor(() => expect(screen.getByRole("button", {
      name: "恢復 take for granted"
    })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", {
      name: "恢復 take for granted"
    }));
    expect(chat.setLearningItemDraftState)
      .toHaveBeenCalledWith("batch-a", "draft-b", "included");

    await waitFor(() => expect(
      screen.getByRole("button", { name: "還原 happy" })
    ).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "還原 happy" }));
    expect(chat.restoreLearningItemMatch)
      .toHaveBeenCalledWith("batch-a", "item-happy");

    await waitFor(() => expect(screen.getByRole("button", {
      name: "提交學習卡片"
    })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "提交學習卡片" }));
    expect(chat.submitLearningItemBatch).toHaveBeenCalledWith("batch-a");
  });
});
