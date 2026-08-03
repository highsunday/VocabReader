import { describe, expect, it } from "vitest";
import {
  formatSegmentRetellingSubmission,
  segmentRetellingAnswers,
  segmentRetellingArtifacts
} from "./segment-retelling-artifact";

const task = {
  version: 1 as const,
  kind: "task" as const,
  practiceId: "retelling-one",
  title: "Retell this passage",
  answerLanguage: "English",
  answerInstruction: "請使用英文表達原意或復述。"
};

const firstGrade = {
  version: 1 as const,
  kind: "grade" as const,
  practiceId: "retelling-one",
  attempt: 1 as const,
  feedback: {
    strengths: ["有抓到作者支持長期投資。"],
    contentCorrections: ["作者並未主張忽略所有風險。"],
    omissions: ["遺漏複利會建立在先前報酬之上。"],
    languageImprovements: ["react emotionally 比 become emotional 更貼近原意。"]
  },
  foundationalRevision: "The author supports long-term investing because returns compound.",
  foundationalChanges: {
    content: ["修正作者對風險的立場。"],
    language: ["改用 supports long-term investing。"]
  },
  nextStepRevision: "The author supports long-term investing because returns compound over time, but emotional reactions can interrupt the process.",
  addedDetails: ["補入短期情緒反應會中斷複利。"],
  scores: {
    accuracy: { score: 4, reason: "主旨正確，只有一處過度推論。" },
    completeness: { score: 3, reason: "涵蓋主旨但遺漏一項關鍵因果。" },
    expression: { score: 4, reason: "清楚但有一處搭配可改善。" },
    total: 11
  }
};

const secondGrade = {
  ...firstGrade,
  attempt: 2 as const,
  scores: {
    accuracy: { score: 5, reason: "內容正確。" },
    completeness: { score: 4, reason: "關鍵因果大多完整。" },
    expression: { score: 5, reason: "組織自然清楚。" },
    total: 14
  },
  comparison: {
    summary: "第二次修正了過度推論，也補回複利的因果關係。",
    accuracyDelta: 1,
    completenessDelta: 1,
    expressionDelta: 1,
    totalDelta: 3
  }
};

function message(text: string) {
  return { role: "assistant" as const, text };
}

function artifact(language: string, value: unknown) {
  return `\`\`\`${language}\n${JSON.stringify(value)}\n\`\`\``;
}

describe("segment retelling artifacts", () => {
  it("collects one task and two ordered matching grades", () => {
    expect(segmentRetellingArtifacts([
      message(artifact("reading-retelling-task", task)),
      message(artifact("reading-retelling-grade", firstGrade)),
      message(artifact("reading-retelling-grade", secondGrade))
    ])).toEqual({ task, grades: [firstGrade, secondGrade] });
  });

  it("rejects scores outside 0-5 and totals that do not add up", () => {
    const invalidRange = {
      ...firstGrade,
      scores: {
        ...firstGrade.scores,
        accuracy: { score: 6, reason: "too high" },
        total: 13
      }
    };
    const invalidTotal = {
      ...firstGrade,
      scores: { ...firstGrade.scores, total: 12 }
    };

    expect(segmentRetellingArtifacts([
      message(artifact("reading-retelling-task", task)),
      message(artifact("reading-retelling-grade", invalidRange)),
      message(artifact("reading-retelling-grade", invalidTotal))
    ])).toEqual({ task, grades: [] });
  });

  it("rejects mismatched ids and a second grade without a first grade", () => {
    expect(segmentRetellingArtifacts([
      message(artifact("reading-retelling-task", task)),
      message(artifact("reading-retelling-grade", {
        ...firstGrade,
        practiceId: "another-practice"
      })),
      message(artifact("reading-retelling-grade", secondGrade))
    ])).toEqual({ task, grades: [] });
  });

  it("ignores incomplete streamed JSON and keeps the newest valid task", () => {
    const newerTask = { ...task, practiceId: "retelling-two" };
    expect(segmentRetellingArtifacts([
      message(artifact("reading-retelling-task", task)),
      message("```reading-retelling-task\n{\"version\":1"),
      message(artifact("reading-retelling-task", newerTask))
    ])).toEqual({ task: newerTask, grades: [] });
  });

  it("formats a bounded attempt submission", () => {
    expect(formatSegmentRetellingSubmission(task, 1, "  My own retelling.  "))
      .toBe([
        "$submit-segment-retelling",
        "Practice ID: retelling-one",
        "Attempt: 1",
        "Answer language: English",
        "",
        "Learner retelling:",
        "My own retelling."
      ].join("\n"));
  });

  it("restores both original answers from persisted user submissions", () => {
    expect(segmentRetellingAnswers([
      {
        role: "user",
        text: formatSegmentRetellingSubmission(task, 1, "First line.\nSecond line.")
      },
      {
        role: "user",
        text: formatSegmentRetellingSubmission(
          { ...task, practiceId: "another-practice" },
          1,
          "Unrelated answer."
        )
      },
      {
        role: "user",
        text: formatSegmentRetellingSubmission(task, 2, "Improved answer.")
      }
    ], task.practiceId)).toEqual([
      "First line.\nSecond line.",
      "Improved answer."
    ]);
  });
});
