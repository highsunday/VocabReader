import { describe, expect, it } from "vitest";
import {
  formatReadingPracticeSubmission,
  readingPracticeArtifacts
} from "./reading-practice-artifact";

const quizArtifact = {
  version: 1 as const,
  kind: "quiz" as const,
  quizId: "quiz-forest-01",
  title: "Forest Reading Check",
  cefr: "B1",
  difficultySummary: "The passage uses contrast and implied meaning.",
  multipleChoice: [{
    id: "mc-1",
    number: 1,
    prompt: "What is the main idea?",
    options: {
      A: "A changing forest",
      B: "A city journey",
      C: "A family recipe",
      D: "A school rule"
    }
  }],
  openEnded: [{
    id: "open-1",
    number: 2,
    prompt: "Explain why the forest changed."
  }]
};

const gradeArtifact = {
  version: 1 as const,
  kind: "grade" as const,
  quizId: "quiz-forest-01",
  multipleChoice: [{
    id: "mc-1",
    correct: false,
    correctAnswer: "A",
    feedback: "The passage focuses on how the forest changed over time."
  }],
  openEnded: [{
    id: "open-1",
    correct: true,
    assessment: "The answer is relevant and clear.",
    correctedAnswer: "The forest changed because the climate became drier.",
    feedback: "Good use of because to connect cause and result."
  }],
  summary: {
    score: "0/1",
    reading: "Review the main contrast in the passage.",
    writing: "The explanation is concise and grammatical.",
    reviewPoints: ["contrast", "cause and effect"]
  }
};

describe("reading practice artifacts", () => {
  it("reads the latest valid quiz and matching grade from assistant messages", () => {
    const messages = [{
      role: "assistant" as const,
      text: [
        "Your paper is ready.",
        "```reading-practice-quiz",
        JSON.stringify(quizArtifact),
        "```"
      ].join("\n")
    }, {
      role: "user" as const,
      text: "my answers"
    }, {
      role: "assistant" as const,
      text: [
        "Marked.",
        "```reading-practice-grade",
        JSON.stringify(gradeArtifact),
        "```"
      ].join("\n")
    }];

    expect(readingPracticeArtifacts(messages)).toEqual({
      quiz: quizArtifact,
      grade: gradeArtifact
    });
  });

  it("ignores incomplete, malformed and mismatched artifacts while streaming", () => {
    const messages = [{
      role: "assistant" as const,
      text: "```reading-practice-quiz\n{\"version\":1"
    }, {
      role: "assistant" as const,
      text: [
        "```reading-practice-quiz",
        JSON.stringify(quizArtifact),
        "```",
        "```reading-practice-grade",
        JSON.stringify({ ...gradeArtifact, quizId: "another-quiz" }),
        "```"
      ].join("\n")
    }];

    expect(readingPracticeArtifacts(messages)).toEqual({
      quiz: quizArtifact,
      grade: undefined
    });
  });

  it("waits for grading to cover every question before marking the paper complete", () => {
    const messages = [{
      role: "assistant" as const,
      text: [
        "```reading-practice-quiz",
        JSON.stringify(quizArtifact),
        "```",
        "```reading-practice-grade",
        JSON.stringify({ ...gradeArtifact, openEnded: [] }),
        "```"
      ].join("\n")
    }];

    expect(readingPracticeArtifacts(messages)).toEqual({
      quiz: quizArtifact,
      grade: undefined
    });
  });

  it("formats every answer with stable ids for submission to the same AI conversation", () => {
    expect(formatReadingPracticeSubmission(quizArtifact, {
      "mc-1": "A",
      "open-1": "Because the climate became drier."
    })).toBe([
      "$submit-reading-practice",
      "Quiz ID: quiz-forest-01",
      "",
      "Multiple-choice answers:",
      "mc-1 (Question 1): A",
      "",
      "Open-ended answers:",
      "open-1 (Question 2):",
      "Because the climate became drier."
    ].join("\n"));
  });
});
