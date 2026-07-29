import { describe, expect, it } from "vitest";
import type { LearningItem } from "../shared/learning-contracts";
import {
  parseReviewGrade,
  parseReviewPaper
} from "./spaced-review-artifacts";

const item: LearningItem = {
  id: "item-1",
  title: "bank",
  itemType: "word",
  cefr: "A2",
  sense: "financial institution",
  markdownContent: "## Meaning\n銀行",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  trashedAt: null
};

describe("spaced review artifacts", () => {
  it("accepts a paper and grade that exactly cover the trusted scope", () => {
    const paper = parseReviewPaper(`
\`\`\`review-paper
{"paperId":"paper-1","questions":[{"questionId":"q1","itemId":"item-1","title":"bank","sense":"financial institution","cefr":"A2","beforeTarget":"She went to the ","targetText":"bank","afterTarget":" before work."}]}
\`\`\`
`, "paper-1", [item]);
    const grade = parseReviewGrade(`
\`\`\`review-grade
{"paperId":"paper-1","results":[{"questionId":"q1","itemId":"item-1","feedback":"意思正確。","rating":"easy"}]}
\`\`\`
`, paper);

    expect(paper.questions[0]).toMatchObject({
      itemId: item.id,
      targetText: "bank"
    });
    expect(grade.results[0]).toMatchObject({
      itemId: item.id,
      rating: "easy"
    });
  });

  it("preserves structured expression feedback and safely degrades unavailable advice", () => {
    const paper = parseReviewPaper(`
\`\`\`review-paper
{"paperId":"paper-1","questions":[{"questionId":"q1","itemId":"item-1","title":"bank","sense":"financial institution","cefr":"A2","beforeTarget":"She went to the ","targetText":"bank","afterTarget":" before work."}]}
\`\`\`
`, "paper-1", [item]);
    const grade = parseReviewGrade(`
\`\`\`review-grade
{"paperId":"paper-1","results":[{"questionId":"q1","itemId":"item-1","feedback":"意思正確。","recommendedAnswer":"A bank is a place where people keep and manage their money.","rating":"easy","expressionFeedback":{"status":"improvable","message":"institution 比 place 更精確。","suggestedAnswer":"A bank is an institution where people deposit, withdraw, or borrow money."}}]}
\`\`\`
`, paper);

    expect(grade.results[0].recommendedAnswer).toBe(
      "A bank is a place where people keep and manage their money."
    );
    expect(grade.results[0].expressionFeedback).toEqual({
      status: "improvable",
      message: "institution 比 place 更精確。",
      suggestedAnswer:
        "A bank is an institution where people deposit, withdraw, or borrow money."
    });

    const unavailable = parseReviewGrade(`
\`\`\`review-grade
{"paperId":"paper-1","results":[{"questionId":"q1","itemId":"item-1","feedback":"意思正確。","rating":"easy","expressionFeedback":{"status":"improvable","message":"缺少建議改寫"}}]}
\`\`\`
`, paper);
    expect(unavailable.results[0].expressionFeedback).toEqual({
      status: "not-applicable",
      message: null,
      suggestedAnswer: null
    });

    const legacyInsufficient = parseReviewGrade(`
\`\`\`review-grade
{"paperId":"paper-1","results":[{"questionId":"q1","itemId":"item-1","feedback":"意思正確。","rating":"easy","expressionFeedback":{"status":"insufficient","message":"請用完整句說明。","suggestedAnswer":null}}]}
\`\`\`
`, paper);
    expect(legacyInsufficient.results[0]).toMatchObject({
      feedback: "意思正確。",
      rating: "easy",
      expressionFeedback: {
        status: "not-applicable",
        message: null,
        suggestedAnswer: null
      }
    });
  });

  it("rejects missing, duplicated, unknown or mismatched scoped results", () => {
    expect(() => parseReviewPaper(`
\`\`\`review-paper
{"paperId":"paper-1","questions":[{"questionId":"q1","itemId":"unknown","title":"bank","sense":"financial institution","cefr":"A2","beforeTarget":"","targetText":"bank","afterTarget":"."}]}
\`\`\`
`, "paper-1", [item])).toThrow(/outside/);

    const paper = parseReviewPaper(`
\`\`\`review-paper
{"paperId":"paper-1","questions":[{"questionId":"q1","itemId":"item-1","title":"bank","sense":"financial institution","cefr":"A2","beforeTarget":"","targetText":"bank","afterTarget":"."}]}
\`\`\`
`, "paper-1", [item]);
    expect(() => parseReviewGrade(`
\`\`\`review-grade
{"paperId":"other-paper","results":[]}
\`\`\`
`, paper)).toThrow(/does not cover/);
  });
});
