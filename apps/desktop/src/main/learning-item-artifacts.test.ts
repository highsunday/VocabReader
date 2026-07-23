import { describe, expect, it } from "vitest";
import {
  parseLearningItemArtifacts,
  parseLearningItemRecheck
} from "./learning-item-artifacts";

describe("parseLearningItemArtifacts", () => {
  it("extracts and validates a pending draft batch without rendering raw JSON", () => {
    let id = 0;
    const result = parseLearningItemArtifacts([
      "已整理完成，請確認。",
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "reluctant",
          itemType: "word",
          cefr: "B2",
          sense: "unwilling or hesitant",
          markdownContent: "## Meaning\n不情願。\n\n## Examples\n1. She was reluctant."
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
      }),
      "```"
    ].join("\n"), () => `generated-${++id}`);

    expect(result.text).toBe("已整理完成，請確認。");
    expect(result.error).toBeUndefined();
    expect(result.batch).toMatchObject({
      id: "generated-1",
      status: "pending",
      drafts: [{
        id: "generated-2",
        title: "reluctant",
        state: "included"
      }],
      existing: [{ itemId: "item-bank", status: "active" }],
      trashed: [{ itemId: "item-happy", status: "trashed" }]
    });
  });

  it("rejects malformed draft output and never exposes a submittable batch", () => {
    const result = parseLearningItemArtifacts([
      "Draft ready.",
      "```learning-item-result",
      '{"drafts":[{"title":"broken","itemType":"sentence"}]}',
      "```"
    ].join("\n"));

    expect(result.text).toBe("Draft ready.");
    expect(result.batch).toBeUndefined();
    expect(result.error).toMatch(/學習項目草稿/);
  });

  it("extracts a typed invitation after annotation explanation", () => {
    const result = parseLearningItemArtifacts([
      "是否要將這些內容加入生詞庫？",
      "```learning-item-invitation",
      JSON.stringify({
        targets: [
          { title: "reluctant", senseHint: "unwilling in this context" },
          { title: "take for granted", senseHint: "fail to appreciate" }
        ]
      }),
      "```"
    ].join("\n"));

    expect(result.text).toBe("是否要將這些內容加入生詞庫？");
    expect(result.invitation?.targets).toEqual([
      { title: "reluctant", senseHint: "unwilling in this context" },
      { title: "take for granted", senseHint: "fail to appreciate" }
    ]);
  });

  it("extracts clarified creation targets without rendering raw JSON", () => {
    const result = parseLearningItemArtifacts([
      "要把 apple 和 banana 都加入嗎？",
      "```learning-item-request",
      JSON.stringify({
        targets: [
          { title: "apple" },
          { title: "banana" }
        ]
      }),
      "```"
    ].join("\n"));

    expect(result.text).toBe("要把 apple 和 banana 都加入嗎？");
    expect(result.request?.targets).toEqual([
      { title: "apple" },
      { title: "banana" }
    ]);
    expect(result.error).toBeUndefined();
  });

  it("rejects a clarification request with more than 50 targets", () => {
    const result = parseLearningItemArtifacts([
      "要加入這些內容嗎？",
      "```learning-item-request",
      JSON.stringify({
        targets: Array.from(
          { length: 51 },
          (_, index) => ({ title: `word-${index}` })
        )
      }),
      "```"
    ].join("\n"));

    expect(result.request).toBeUndefined();
    expect(result.error).toMatch(/加入生詞庫邀請格式錯誤/);
  });

  it("validates one submission recheck decision for every draft", () => {
    expect(parseLearningItemRecheck([
      "```learning-item-recheck",
      JSON.stringify({
        decisions: [{
          draftId: "draft-bank",
          decision: "existing",
          itemId: "item-bank"
        }, {
          draftId: "draft-reluctant",
          decision: "create"
        }]
      }),
      "```"
    ].join("\n"))).toEqual([{
      draftId: "draft-bank",
      decision: "existing",
      itemId: "item-bank"
    }, {
      draftId: "draft-reluctant",
      decision: "create"
    }]);

    expect(() => parseLearningItemRecheck([
      "```learning-item-recheck",
      '{"decisions":[{"draftId":"draft-bank","decision":"existing"}]}',
      "```"
    ].join("\n"))).toThrow(/重新檢查/);
  });
});
