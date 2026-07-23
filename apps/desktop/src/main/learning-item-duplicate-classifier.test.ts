import { describe, expect, it } from "vitest";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import { createFakeCodexAppServer } from "./fake-codex-app-server";
import { classifyLearningItemDuplicatesWithCodex } from "./learning-item-duplicate-classifier";

describe("classifyLearningItemDuplicatesWithCodex", () => {
  it("sends only supplied drafts and exact-title candidates for one semantic recheck", async () => {
    const fake = createFakeCodexAppServer({
      answer: [
        "```learning-item-recheck",
        JSON.stringify({
          decisions: [{
            draftId: "draft-bank",
            decision: "existing",
            itemId: "item-bank"
          }]
        }),
        "```"
      ].join("\n")
    });

    const result = await classifyLearningItemDuplicatesWithCodex({
      createClient: () => new SpawnedCodexAppServerClient({
        spawnProcess: () => fake.child
      }),
      workingDirectory: "/tmp/lingoshelf-recheck-test",
      skillPath: "/tmp/lingoshelf-recheck-test/create-learning-items/SKILL.md",
      skillInstructions: "Submission Recheck",
      drafts: [{
        id: "draft-bank",
        title: "bank",
        itemType: "word",
        cefr: "A2",
        sense: "an organization that keeps and lends money",
        markdownContent: "## Meaning\n銀行",
        state: "included"
      }],
      candidates: [{
        id: "item-bank",
        title: " BANK ",
        itemType: "word",
        cefr: "A2",
        sense: "financial institution",
        markdownContent: "## Meaning\nA business that holds money.",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        trashedAt: null
      }]
    });

    expect(result).toEqual([{
      draftId: "draft-bank",
      decision: "existing",
      itemId: "item-bank"
    }]);
    const turn = fake.requests.find((request) => request.method === "turn/start");
    const payload = JSON.stringify(turn?.params);
    expect(payload).toContain("draft-bank");
    expect(payload).toContain("item-bank");
    expect(payload).not.toContain("learning-items.sqlite");
    expect(fake.requests.filter((request) => request.method === "turn/start"))
      .toHaveLength(1);
  });
});
