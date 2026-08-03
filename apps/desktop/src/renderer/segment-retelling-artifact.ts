export interface SegmentRetellingTask {
  version: 1;
  kind: "task";
  practiceId: string;
  title: string;
  answerLanguage: string;
  answerInstruction: string;
}

export interface SegmentRetellingScore {
  score: number;
  reason: string;
}

export interface SegmentRetellingComparison {
  summary: string;
  accuracyDelta: number;
  completenessDelta: number;
  expressionDelta: number;
  totalDelta: number;
}

export interface SegmentRetellingGrade {
  version: 1;
  kind: "grade";
  practiceId: string;
  attempt: 1 | 2;
  feedback: {
    strengths: string[];
    contentCorrections: string[];
    omissions: string[];
    languageImprovements: string[];
  };
  foundationalRevision: string;
  foundationalChanges: {
    content: string[];
    language: string[];
  };
  nextStepRevision: string;
  addedDetails: string[];
  scores: {
    accuracy: SegmentRetellingScore;
    completeness: SegmentRetellingScore;
    expression: SegmentRetellingScore;
    total: number;
  };
  comparison?: SegmentRetellingComparison;
}

interface ArtifactMessage {
  role: "user" | "assistant";
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number) {
  return Number.isInteger(value) && Number(value) >= minimum &&
    Number(value) <= maximum;
}

function isTask(value: unknown): value is SegmentRetellingTask {
  return isRecord(value) &&
    value.version === 1 &&
    value.kind === "task" &&
    isString(value.practiceId) &&
    isString(value.title) &&
    isString(value.answerLanguage) &&
    isString(value.answerInstruction);
}

function isScore(value: unknown): value is SegmentRetellingScore {
  return isRecord(value) &&
    isIntegerInRange(value.score, 0, 5) &&
    isString(value.reason);
}

function isComparison(value: unknown): value is SegmentRetellingComparison {
  return isRecord(value) &&
    isString(value.summary) &&
    isIntegerInRange(value.accuracyDelta, -5, 5) &&
    isIntegerInRange(value.completenessDelta, -5, 5) &&
    isIntegerInRange(value.expressionDelta, -5, 5) &&
    isIntegerInRange(value.totalDelta, -15, 15);
}

function isGrade(value: unknown): value is SegmentRetellingGrade {
  if (!isRecord(value) || !isRecord(value.feedback) ||
    !isRecord(value.foundationalChanges) || !isRecord(value.scores)) {
    return false;
  }
  const scores = value.scores;
  if (!isScore(scores.accuracy) || !isScore(scores.completeness) ||
    !isScore(scores.expression) || !isIntegerInRange(scores.total, 0, 15) ||
    scores.total !== scores.accuracy.score + scores.completeness.score +
      scores.expression.score) {
    return false;
  }
  const attempt = value.attempt;
  return value.version === 1 &&
    value.kind === "grade" &&
    isString(value.practiceId) &&
    (attempt === 1 || attempt === 2) &&
    isStringArray(value.feedback.strengths) &&
    isStringArray(value.feedback.contentCorrections) &&
    isStringArray(value.feedback.omissions) &&
    isStringArray(value.feedback.languageImprovements) &&
    isString(value.foundationalRevision) &&
    isStringArray(value.foundationalChanges.content) &&
    isStringArray(value.foundationalChanges.language) &&
    isString(value.nextStepRevision) &&
    isStringArray(value.addedDetails) &&
    (attempt === 1
      ? value.comparison === undefined
      : isComparison(value.comparison));
}

function fencedJson(text: string, language: string): unknown[] {
  const blocks: unknown[] = [];
  const expression = new RegExp(
    `\`\`\`${language}\\s*\\n([\\s\\S]*?)\\n\`\`\``,
    "g"
  );
  for (const match of text.matchAll(expression)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Incomplete streaming and malformed artifacts never drive the UI.
    }
  }
  return blocks;
}

function comparisonMatches(
  first: SegmentRetellingGrade,
  second: SegmentRetellingGrade
) {
  const comparison = second.comparison;
  if (!comparison) return false;
  return comparison.accuracyDelta ===
      second.scores.accuracy.score - first.scores.accuracy.score &&
    comparison.completenessDelta ===
      second.scores.completeness.score - first.scores.completeness.score &&
    comparison.expressionDelta ===
      second.scores.expression.score - first.scores.expression.score &&
    comparison.totalDelta === second.scores.total - first.scores.total;
}

export function segmentRetellingArtifacts(messages: ArtifactMessage[]): {
  task?: SegmentRetellingTask;
  grades: SegmentRetellingGrade[];
} {
  let task: SegmentRetellingTask | undefined;
  let grades: SegmentRetellingGrade[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const candidate of fencedJson(message.text, "reading-retelling-task")) {
      if (isTask(candidate)) {
        task = candidate;
        grades = [];
      }
    }
    for (const candidate of fencedJson(message.text, "reading-retelling-grade")) {
      if (!task || !isGrade(candidate) ||
        candidate.practiceId !== task.practiceId) continue;
      if (candidate.attempt === 1) {
        grades = [candidate];
      } else if (grades[0]?.attempt === 1 && comparisonMatches(grades[0], candidate)) {
        grades = [grades[0], candidate];
      }
    }
  }

  return { task, grades };
}

export function segmentRetellingAnswers(
  messages: ArtifactMessage[],
  practiceId: string
): [string, string] {
  const answers: [string, string] = ["", ""];
  const submissionPattern = [
    /^\$submit-segment-retelling\r?\n/,
    /Practice ID: ([^\r\n]+)\r?\n/,
    /Attempt: ([12])\r?\n/,
    /Answer language: [^\r\n]+\r?\n/,
    /\r?\nLearner retelling:\r?\n([\s\S]+)$/
  ].map((part) => part.source).join("");
  const expression = new RegExp(submissionPattern);

  for (const message of messages) {
    if (message.role !== "user") continue;
    const match = message.text.match(expression);
    if (!match || match[1] !== practiceId) continue;
    const attempt = Number(match[2]);
    const answer = match[3].trim();
    if ((attempt === 1 || attempt === 2) && answer) {
      answers[attempt - 1] = answer;
    }
  }
  return answers;
}

export function formatSegmentRetellingSubmission(
  task: SegmentRetellingTask,
  attempt: 1 | 2,
  answer: string
) {
  return [
    "$submit-segment-retelling",
    `Practice ID: ${task.practiceId}`,
    `Attempt: ${attempt}`,
    `Answer language: ${task.answerLanguage}`,
    "",
    "Learner retelling:",
    answer.trim()
  ].join("\n");
}
