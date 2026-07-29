import type { LearningItem } from "../shared/learning-contracts";
import type {
  ReviewExpressionFeedback,
  ReviewGrade,
  ReviewPaper,
  ReviewRating
} from "../shared/review-contracts";

const ratings = new Set<ReviewRating>(["forgotten", "hard", "good", "easy"]);
const cefr = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): value is string {
  return typeof value === "string";
}

function nonEmpty(value: unknown): value is string {
  return text(value) && Boolean(value.trim());
}

function unavailableExpressionFeedback(): ReviewExpressionFeedback {
  return {
    status: "not-applicable",
    message: null,
    suggestedAnswer: null
  };
}

function parseExpressionFeedback(value: unknown): ReviewExpressionFeedback {
  if (!isObject(value) || typeof value.status !== "string") {
    return unavailableExpressionFeedback();
  }
  if (value.status === "not-applicable") {
    return unavailableExpressionFeedback();
  }
  if (value.status === "natural" &&
    nonEmpty(value.message) &&
    (value.suggestedAnswer === null || value.suggestedAnswer === undefined)) {
    return {
      status: "natural",
      message: value.message,
      suggestedAnswer: null
    };
  }
  if (value.status === "improvable" &&
    nonEmpty(value.message) &&
    nonEmpty(value.suggestedAnswer)) {
    return {
      status: "improvable",
      message: value.message,
      suggestedAnswer: value.suggestedAnswer
    };
  }
  return unavailableExpressionFeedback();
}

function fencedJson(source: string, name: "review-paper" | "review-grade"): unknown {
  const matches = [...source.matchAll(
    new RegExp(`\\\`\\\`\\\`${name}\\s*\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, "g")
  )];
  if (matches.length !== 1) throw new Error(`Invalid AI ${name}`);
  try {
    return JSON.parse(matches[0][1]);
  } catch {
    throw new Error(`Invalid AI ${name} JSON`);
  }
}

export function parseReviewPaper(
  source: string,
  paperId: string,
  items: LearningItem[]
): ReviewPaper {
  const value = fencedJson(source, "review-paper");
  if (!isObject(value) || value.paperId !== paperId ||
    !Array.isArray(value.questions) ||
    value.questions.length !== items.length) {
    throw new Error("The AI review paper does not cover the full session");
  }
  const itemById = new Map(items.map((item) => [item.id, item]));
  const questionIds = new Set<string>();
  const itemIds = new Set<string>();
  const questions = value.questions.map((question): ReviewPaper["questions"][number] => {
    if (!isObject(question) ||
      !nonEmpty(question.questionId) ||
      !nonEmpty(question.itemId) ||
      !nonEmpty(question.title) ||
      !nonEmpty(question.sense) ||
      !cefr.has(question.cefr as string) ||
      !text(question.beforeTarget) ||
      !nonEmpty(question.targetText) ||
      !text(question.afterTarget)) {
      throw new Error("Invalid AI review question");
    }
    const item = itemById.get(question.itemId);
    if (!item ||
      question.title !== item.title ||
      question.sense !== item.sense ||
      question.cefr !== item.cefr ||
      questionIds.has(question.questionId) ||
      itemIds.has(question.itemId)) {
      throw new Error("AI review question is outside this session");
    }
    questionIds.add(question.questionId);
    itemIds.add(question.itemId);
    return {
      questionId: question.questionId,
      itemId: question.itemId,
      title: question.title,
      sense: question.sense,
      cefr: item.cefr,
      beforeTarget: question.beforeTarget,
      targetText: question.targetText,
      afterTarget: question.afterTarget
    };
  });
  if (itemIds.size !== items.length) {
    throw new Error("The AI review paper does not cover the full session");
  }
  return { paperId, questions };
}

export function parseReviewGrade(
  source: string,
  paper: ReviewPaper
): ReviewGrade {
  const value = fencedJson(source, "review-grade");
  if (!isObject(value) || value.paperId !== paper.paperId ||
    !Array.isArray(value.results) ||
    value.results.length !== paper.questions.length) {
    throw new Error("AI grading does not cover the full paper");
  }
  const questions = new Map(paper.questions.map((question) => [
    question.questionId,
    question
  ]));
  const seen = new Set<string>();
  const results = value.results.map((result): ReviewGrade["results"][number] => {
    if (!isObject(result) ||
      !nonEmpty(result.questionId) ||
      !nonEmpty(result.itemId) ||
      !nonEmpty(result.feedback) ||
      !ratings.has(result.rating as ReviewRating)) {
      throw new Error("Invalid AI review grading");
    }
    const question = questions.get(result.questionId);
    if (!question || question.itemId !== result.itemId ||
      seen.has(result.questionId)) {
      throw new Error("AI grading is outside the current paper");
    }
    seen.add(result.questionId);
    return {
      questionId: result.questionId,
      itemId: result.itemId,
      feedback: result.feedback,
      recommendedAnswer: nonEmpty(result.recommendedAnswer)
        ? result.recommendedAnswer
        : undefined,
      rating: result.rating as ReviewRating,
      expressionFeedback: parseExpressionFeedback(result.expressionFeedback)
    };
  });
  return { paperId: paper.paperId, results };
}
