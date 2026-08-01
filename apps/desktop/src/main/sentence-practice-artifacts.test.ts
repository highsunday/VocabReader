import { describe, expect, it } from "vitest";
import type { SentencePracticeItem } from "../shared/sentence-practice-contracts";
import { parseSentencePracticeResult } from "./sentence-practice-artifacts";

const items: SentencePracticeItem[] = [{
  id: "item-1",
  title: "create",
  itemType: "word",
  cefr: "A2",
  sense: "make something",
  meaning: "創造；製作。"
}, {
  id: "item-2",
  title: "on the verge of",
  itemType: "phrase",
  cefr: "C1",
  sense: "very close to happening",
  meaning: "瀕臨；即將發生。"
}];

describe("sentence-practice artifacts", () => {
  it("accepts a bounded needs-revision result with natural-form guidance", () => {
    const result = parseSentencePracticeResult(`
\`\`\`sentence-practice-result
{"sessionId":"session-1","status":"needs-revision","issues":[{"itemId":"item-2","title":"on the verge of","kind":"unnatural-form","message":"Use the complete phrase in a natural clause."}]}
\`\`\`
`, "session-1", items);

    expect(result).toEqual({
      status: "needs-revision",
      issues: [{
        itemId: "item-2",
        title: "on the verge of",
        kind: "unnatural-form",
        message: "Use the complete phrase in a natural clause."
      }]
    });
  });

  it("accepts complete feedback that preserves every trusted item usage", () => {
    const result = parseSentencePracticeResult(`
\`\`\`sentence-practice-result
{"sessionId":"session-1","status":"completed","revisedText":"We created a raft when the town was on the verge of flooding.","changes":[{"original":"We create a raft.","revised":"We created a raft.","explanation":"Use past tense for a finished event."}],"conversationalSuggestions":[{"original":"We made a raft quickly.","suggested":"We quickly put together a raft.","explanation":"This sounds more conversational."}],"usages":[{"itemId":"item-1","title":"create","usage":"created a raft"},{"itemId":"item-2","title":"on the verge of","usage":"on the verge of flooding"}]}
\`\`\`
`, "session-1", items);

    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("Expected feedback");
    expect(result.feedback.revisedText).toContain("created a raft");
    expect(result.feedback.conversationalSuggestions[0]).toMatchObject({
      suggested: "We quickly put together a raft."
    });
    expect(result.feedback.usages.map(({ itemId }) => itemId)).toEqual([
      "item-1",
      "item-2"
    ]);
  });

  it("rejects unknown, duplicate, missing and mixed-scope results", () => {
    expect(() => parseSentencePracticeResult(`
\`\`\`sentence-practice-result
{"sessionId":"session-1","status":"needs-revision","issues":[{"itemId":"unknown","title":"create","kind":"missing","message":"Missing."}]}
\`\`\`
`, "session-1", items)).toThrow(/outside/);

    expect(() => parseSentencePracticeResult(`
\`\`\`sentence-practice-result
{"sessionId":"session-1","status":"completed","revisedText":"Text.","changes":[],"conversationalSuggestions":[],"issues":[],"usages":[{"itemId":"item-1","title":"create","usage":"created"}]}
\`\`\`
`, "session-1", items)).toThrow(/full practice scope/);

    expect(() => parseSentencePracticeResult(`
\`\`\`sentence-practice-result
{"sessionId":"session-1","status":"completed","revisedText":"Text.","changes":[],"conversationalSuggestions":[],"usages":[{"itemId":"item-1","title":"create","usage":"created"},{"itemId":"item-1","title":"create","usage":"created again"}]}
\`\`\`
`, "session-1", items)).toThrow(/outside/);
  });
});
