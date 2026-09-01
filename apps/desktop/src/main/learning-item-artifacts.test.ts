import { describe, expect, it } from "vitest";
import {
  parseLearningItemEditResult,
  parseLearningItemArtifacts,
  parseLearningItemRecheck
} from "./learning-item-artifacts";
import * as artifactModule from "./learning-item-artifacts";

describe("parseLearningItemArtifacts", () => {
  it("exposes a strict parser for a bounded learning-item edit result", () => {
    expect(
      (artifactModule as Record<string, unknown>).parseLearningItemEditResult
    ).toBeTypeOf("function");
  });

  it("accepts only the matching complete learning-item edit artifact", () => {
    const source = `\`\`\`learning-item-edit-result\n${JSON.stringify({
      version: 1,
      kind: "learning-item-edit-result",
      sessionId: "session-1",
      itemId: "item-1",
      markdownContent: "## Meaning\n損害或削弱。",
      cautionNote: "impair 是削弱；repair 是修復。"
    })}\n\`\`\``;

    expect(parseLearningItemEditResult(source, {
      sessionId: "session-1",
      itemId: "item-1"
    })).toMatchObject({
      markdownContent: "## Meaning\n損害或削弱。",
      cautionNote: "impair 是削弱；repair 是修復。"
    });
    expect(() => parseLearningItemEditResult(source, {
      sessionId: "another-session",
      itemId: "item-1"
    })).toThrow(/edit result/);
    expect(() => parseLearningItemEditResult(
      source.replace('"cautionNote"', '"title":"repair","cautionNote"'),
      { sessionId: "session-1", itemId: "item-1" }
    )).toThrow(/edit result/);
  });
  it("extracts and validates a pending draft batch without rendering raw JSON", () => {
    let id = 0;
    const result = parseLearningItemArtifacts([
      "已整理完成，請確認。",
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "reluctant",
          requestedTitles: ["reluctant"],
          itemType: "word",
      language: "en" as const,
          cefr: "B2",
          sense: "unwilling or hesitant",
          memoryTip: "想像門已打開，但你的腳還黏在地上，很不情願踏出去。",
          markdownContent: "## Meaning\n不情願。\n\n## Examples\n1. She was reluctant."
        }],
        existing: [{
          itemId: "item-bank",
          title: "bank",
          requestedTitles: ["bank", "banks"],
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
        requestedTitles: ["reluctant"],
        memoryTip: "想像門已打開，但你的腳還黏在地上，很不情願踏出去。",
        state: "included"
      }],
      existing: [{
        itemId: "item-bank",
        requestedTitles: ["bank", "banks"],
        status: "active"
      }],
      trashed: [{ itemId: "item-happy", status: "trashed" }]
    });
  });

  it("rejects every new draft that omits a non-empty memory tip", () => {
    for (const memoryTip of [undefined, "", "   ", 42]) {
      const result = parseLearningItemArtifacts([
        "```learning-item-result",
        JSON.stringify({
          drafts: [{
            title: "reluctant",
            requestedTitles: ["reluctant"],
            itemType: "word",
            language: "en",
            cefr: "B2",
            sense: "unwilling or hesitant",
            ...(memoryTip === undefined ? {} : { memoryTip }),
            markdownContent: "## Meaning\n不情願。"
          }],
          existing: [],
          trashed: []
        }),
        "```"
      ].join("\n"));

      expect(result.batch).toBeUndefined();
      expect(result.error).toMatch(/learning-item draft/);
    }
  });

  it("requires and preserves the AI-classified language for every draft", () => {
    const valid = parseLearningItemArtifacts([
      "Cards are ready.",
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "食べる",
          requestedTitles: ["食べました"],
          itemType: "word",
          language: "ja",
          cefr: "A1",
          sense: "to eat",
          memoryTip: "食事を口に運んで、お腹を満たす場面を思い浮かべる。",
          markdownContent: "## Meaning\n食べ物を口にする。"
        }],
        existing: [],
        trashed: []
      }),
      "```"
    ].join("\n"), () => "draft-ja");

    expect(valid.error).toBeUndefined();
    expect(valid.batch?.drafts[0]).toMatchObject({
      id: "draft-ja",
      language: "ja"
    });

    const korean = parseLearningItemArtifacts([
      "카드를 준비했습니다.",
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "이론상",
          requestedTitles: ["이론상"],
          itemType: "phrase",
          language: "ko",
          cefr: "B1",
          sense: "in theory",
          memoryTip: "머릿속 칠판에서는 완벽하지만, 아직 현실 바닥에는 내려오지 않은 그림을 떠올리세요.",
          markdownContent: "## Meaning\n이론적으로 따져 보면."
        }],
        existing: [],
        trashed: []
      }),
      "```"
    ].join("\n"), () => "draft-ko");

    expect(korean.error).toBeUndefined();
    expect(korean.batch?.drafts[0]).toMatchObject({
      id: "draft-ko",
      language: "ko",
      title: "이론상"
    });

    const missing = parseLearningItemArtifacts([
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "bonjour",
          itemType: "word",
          cefr: "A1",
          sense: "hello",
          markdownContent: "## Meaning\nHello."
        }],
        existing: [],
        trashed: []
      }),
      "```"
    ].join("\n"));
    const unsupported = parseLearningItemArtifacts([
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "bonjour",
          itemType: "word",
          language: "fr",
          cefr: "A1",
          sense: "hello",
          markdownContent: "## Meaning\nHello."
        }],
        existing: [],
        trashed: []
      }),
      "```"
    ].join("\n"));

    expect(missing.error).toMatch(/learning-item draft/);
    expect(missing.batch).toBeUndefined();
    expect(unsupported.error).toMatch(/learning-item draft/);
    expect(unsupported.batch).toBeUndefined();
  });

  it("rejects malformed requested-title mappings", () => {
    const result = parseLearningItemArtifacts([
      "Draft ready.",
      "```learning-item-result",
      JSON.stringify({
        drafts: [{
          title: "dog",
          requestedTitles: [],
          itemType: "word",
      language: "en" as const,
          cefr: "A1",
          sense: "domesticated animal",
          markdownContent: "## Meaning\nA common animal."
        }],
        existing: [],
        trashed: []
      }),
      "```"
    ].join("\n"));

    expect(result.batch).toBeUndefined();
    expect(result.error).toMatch(/learning-item draft/);
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
    expect(result.error).toMatch(/learning-item draft/);
  });

  it("extracts a typed invitation after annotation explanation", () => {
    const result = parseLearningItemArtifacts([
      "是否要將這些內容加入Learning Library？",
      "```learning-item-invitation",
      JSON.stringify({
        targets: [
          { title: "reluctant", senseHint: "unwilling in this context" },
          { title: "take for granted", senseHint: "fail to appreciate" }
        ]
      }),
      "```"
    ].join("\n"));

    expect(result.text).toBe("是否要將這些內容加入Learning Library？");
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

  it("extracts an AI-routed multilingual creation intent without rendering raw JSON", () => {
    const result = parseLearningItemArtifacts([
      "```learning-item-intent",
      JSON.stringify({
        intent: "createLearningItems",
        targets: [{ title: "in advance" }]
      }),
      "```"
    ].join("\n"));

    expect(result.intent).toEqual({
      targets: [{ title: "in advance" }]
    });
    expect(result.text).toBe("");
    expect(result.error).toBeUndefined();
  });

  it("accepts at most 50 AI-routed creation targets", () => {
    const buildIntent = (count: number) => [
      "```learning-item-intent",
      JSON.stringify({
        intent: "createLearningItems",
        targets: Array.from(
          { length: count },
          (_, index) => ({ title: `word-${index}` })
        )
      }),
      "```"
    ].join("\n");

    expect(parseLearningItemArtifacts(buildIntent(50)).intent?.targets)
      .toHaveLength(50);

    const rejected = parseLearningItemArtifacts(buildIntent(51));
    expect(rejected.intent).toBeUndefined();
    expect(rejected.error).toMatch(/Invalid learning-item creation intent/);
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
    expect(result.error).toMatch(/Invalid Learning Library invitation/);
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
    ].join("\n"))).toThrow(/recheck/);
  });
});
