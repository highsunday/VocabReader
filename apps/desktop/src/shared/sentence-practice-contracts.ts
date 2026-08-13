import type {
  CefrLevel,
  LearningItemType
} from "./learning-contracts";

export const SENTENCE_PRACTICE_ITEM_COUNT = Object.freeze({
  minimum: 2,
  maximum: 10,
  default: 5
});

export interface SentencePracticeItem {
  id: string;
  title: string;
  itemType: LearningItemType;
  cefr: CefrLevel;
  sense: string;
  meaning: string;
}

export type SentencePracticeIssueKind =
  | "missing"
  | "wrong-sense"
  | "unnatural-form";

export interface SentencePracticeIssue {
  itemId: string;
  title: string;
  kind: SentencePracticeIssueKind;
  message: string;
}

export interface SentencePracticeChange {
  original: string;
  revised: string;
  explanation: string;
}

export interface SentencePracticeSuggestion {
  original: string;
  suggested: string;
  explanation: string;
}

export interface SentencePracticeUsage {
  itemId: string;
  title: string;
  usage: string;
}

export interface SentencePracticeFeedback {
  revisedText: string;
  changes: SentencePracticeChange[];
  conversationalSuggestions: SentencePracticeSuggestion[];
  usages: SentencePracticeUsage[];
}

export interface SentencePracticeExample {
  text: string;
  usages: SentencePracticeUsage[];
}

export type SentencePracticeExamplePhase =
  | "idle"
  | "generating"
  | "ready"
  | "error";

export interface SentencePracticeExampleGeneration {
  phase: SentencePracticeExamplePhase;
  examples: SentencePracticeExample[];
  error: string | null;
}

export type SentencePracticePhase =
  | "writing"
  | "checking"
  | "needs-revision"
  | "completed"
  | "error";

export interface SentencePracticeSession {
  sessionId: string;
  itemCount: number;
  items: SentencePracticeItem[];
  draft: string;
  phase: SentencePracticePhase;
  issues: SentencePracticeIssue[];
  feedback: SentencePracticeFeedback | null;
  error: string | null;
  exampleGeneration: SentencePracticeExampleGeneration;
}

export interface SentencePracticeSnapshot {
  eligibleCount: number;
  dailyCompletedItemCount: number;
  session: SentencePracticeSession | null;
}

export interface StartSentencePracticeInput {
  itemCount: number;
}

export interface SubmitSentencePracticeInput {
  sessionId: string;
  draft: string;
  explanationLanguage: "source" | "zh-TW" | "en" | "ja";
}

export interface GenerateSentencePracticeExamplesInput {
  sessionId: string;
  explanationLanguage: "source" | "zh-TW" | "en" | "ja";
}

export interface SentencePracticeDesktopApi {
  getSnapshot(): Promise<SentencePracticeSnapshot>;
  startSession(
    input: StartSentencePracticeInput
  ): Promise<SentencePracticeSnapshot>;
  submit(
    input: SubmitSentencePracticeInput
  ): Promise<SentencePracticeSnapshot>;
  generateExamples(
    input: GenerateSentencePracticeExamplesInput
  ): Promise<SentencePracticeSnapshot>;
}
