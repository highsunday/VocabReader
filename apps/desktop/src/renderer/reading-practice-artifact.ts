export type MultipleChoiceAnswer = "A" | "B" | "C" | "D";

export interface ReadingPracticeMultipleChoiceQuestion {
  id: string;
  number: number;
  prompt: string;
  options: Record<MultipleChoiceAnswer, string>;
}

export interface ReadingPracticeOpenEndedQuestion {
  id: string;
  number: number;
  prompt: string;
}

export interface ReadingPracticeQuiz {
  version: 1;
  kind: "quiz";
  quizId: string;
  title: string;
  cefr: string;
  difficultySummary: string;
  multipleChoice: ReadingPracticeMultipleChoiceQuestion[];
  openEnded: ReadingPracticeOpenEndedQuestion[];
}

export interface ReadingPracticeMultipleChoiceGrade {
  id: string;
  correct: boolean;
  correctAnswer: MultipleChoiceAnswer;
  feedback: string;
}

export interface ReadingPracticeOpenEndedGrade {
  id: string;
  correct: boolean;
  assessment: string;
  correctedAnswer: string;
  feedback: string;
}

export interface ReadingPracticeGrade {
  version: 1;
  kind: "grade";
  quizId: string;
  multipleChoice: ReadingPracticeMultipleChoiceGrade[];
  openEnded: ReadingPracticeOpenEndedGrade[];
  summary: {
    score: string;
    reading: string;
    writing: string;
    reviewPoints: string[];
  };
}

export type ReadingPracticeAnswers = Record<string, string>;

interface ArtifactMessage {
  role: "user" | "assistant";
  text: string;
}

const ANSWER_LABELS = ["A", "B", "C", "D"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasExactVersion(value: Record<string, unknown>) {
  return value.version === 1;
}

function isMultipleChoiceQuestion(
  value: unknown
): value is ReadingPracticeMultipleChoiceQuestion {
  if (!isRecord(value) || !isRecord(value.options)) return false;
  const options = value.options;
  return isString(value.id) &&
    typeof value.number === "number" &&
    Number.isFinite(value.number) &&
    isString(value.prompt) &&
    ANSWER_LABELS.every((label) => isString(options[label]));
}

function isOpenEndedQuestion(
  value: unknown
): value is ReadingPracticeOpenEndedQuestion {
  return isRecord(value) &&
    isString(value.id) &&
    typeof value.number === "number" &&
    Number.isFinite(value.number) &&
    isString(value.prompt);
}

function isQuiz(value: unknown): value is ReadingPracticeQuiz {
  return isRecord(value) &&
    hasExactVersion(value) &&
    value.kind === "quiz" &&
    isString(value.quizId) &&
    isString(value.title) &&
    isString(value.cefr) &&
    isString(value.difficultySummary) &&
    Array.isArray(value.multipleChoice) &&
    value.multipleChoice.length > 0 &&
    value.multipleChoice.every(isMultipleChoiceQuestion) &&
    Array.isArray(value.openEnded) &&
    value.openEnded.length > 0 &&
    value.openEnded.every(isOpenEndedQuestion);
}

function isMultipleChoiceGrade(
  value: unknown
): value is ReadingPracticeMultipleChoiceGrade {
  return isRecord(value) &&
    isString(value.id) &&
    typeof value.correct === "boolean" &&
    ANSWER_LABELS.includes(value.correctAnswer as MultipleChoiceAnswer) &&
    isString(value.feedback);
}

function isOpenEndedGrade(
  value: unknown
): value is ReadingPracticeOpenEndedGrade {
  return isRecord(value) &&
    isString(value.id) &&
    typeof value.correct === "boolean" &&
    isString(value.assessment) &&
    isString(value.correctedAnswer) &&
    isString(value.feedback);
}

function isGrade(value: unknown): value is ReadingPracticeGrade {
  if (!isRecord(value) || !isRecord(value.summary)) return false;
  return hasExactVersion(value) &&
    value.kind === "grade" &&
    isString(value.quizId) &&
    Array.isArray(value.multipleChoice) &&
    value.multipleChoice.every(isMultipleChoiceGrade) &&
    Array.isArray(value.openEnded) &&
    value.openEnded.every(isOpenEndedGrade) &&
    isString(value.summary.score) &&
    isString(value.summary.reading) &&
    isString(value.summary.writing) &&
    Array.isArray(value.summary.reviewPoints) &&
    value.summary.reviewPoints.every(isString);
}

function gradeCoversQuiz(
  grade: ReadingPracticeGrade,
  quiz: ReadingPracticeQuiz
) {
  const multipleChoiceIds = new Set(
    grade.multipleChoice.map((result) => result.id)
  );
  const openEndedIds = new Set(grade.openEnded.map((result) => result.id));
  return multipleChoiceIds.size === quiz.multipleChoice.length &&
    openEndedIds.size === quiz.openEnded.length &&
    quiz.multipleChoice.every((question) => multipleChoiceIds.has(question.id)) &&
    quiz.openEnded.every((question) => openEndedIds.has(question.id));
}

function fencedJson(text: string, language: string): unknown[] {
  const blocks: unknown[] = [];
  const expression = new RegExp(
    `\\\`\\\`\\\`${language}\\s*\\n([\\s\\S]*?)\\n\\\`\\\`\\\``,
    "g"
  );
  for (const match of text.matchAll(expression)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Streaming and malformed artifacts remain visible as ordinary chat text.
    }
  }
  return blocks;
}

export function readingPracticeArtifacts(messages: ArtifactMessage[]): {
  quiz?: ReadingPracticeQuiz;
  grade?: ReadingPracticeGrade;
} {
  let quiz: ReadingPracticeQuiz | undefined;
  let grade: ReadingPracticeGrade | undefined;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const candidate of fencedJson(message.text, "reading-practice-quiz")) {
      if (isQuiz(candidate)) {
        quiz = candidate;
        grade = undefined;
      }
    }
    for (const candidate of fencedJson(message.text, "reading-practice-grade")) {
      if (
        isGrade(candidate) &&
        quiz &&
        candidate.quizId === quiz.quizId &&
        gradeCoversQuiz(candidate, quiz)
      ) {
        grade = candidate;
      }
    }
  }

  return { quiz, grade };
}

export function formatReadingPracticeSubmission(
  quiz: ReadingPracticeQuiz,
  answers: ReadingPracticeAnswers
) {
  const multipleChoice = quiz.multipleChoice.map((question) =>
    `${question.id} (Question ${question.number}): ${answers[question.id]}`
  );
  const openEnded = quiz.openEnded.flatMap((question) => [
    `${question.id} (Question ${question.number}):`,
    answers[question.id]
  ]);
  return [
    "$submit-reading-practice",
    `Quiz ID: ${quiz.quizId}`,
    "",
    "Multiple-choice answers:",
    ...multipleChoice,
    "",
    "Open-ended answers:",
    ...openEnded
  ].join("\n");
}
