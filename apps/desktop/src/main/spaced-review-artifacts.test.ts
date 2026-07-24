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

  it("rejects missing, duplicated, unknown or mismatched scoped results", () => {
    expect(() => parseReviewPaper(`
\`\`\`review-paper
{"paperId":"paper-1","questions":[{"questionId":"q1","itemId":"unknown","title":"bank","sense":"financial institution","cefr":"A2","beforeTarget":"","targetText":"bank","afterTarget":"."}]}
\`\`\`
`, "paper-1", [item])).toThrow(/範圍/);

    const paper = parseReviewPaper(`
\`\`\`review-paper
{"paperId":"paper-1","questions":[{"questionId":"q1","itemId":"item-1","title":"bank","sense":"financial institution","cefr":"A2","beforeTarget":"","targetText":"bank","afterTarget":"."}]}
\`\`\`
`, "paper-1", [item]);
    expect(() => parseReviewGrade(`
\`\`\`review-grade
{"paperId":"other-paper","results":[]}
\`\`\`
`, paper)).toThrow(/完整覆蓋/);
  });
});
