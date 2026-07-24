import type { LearningItem } from "./learning-contracts";

export type ReviewRating = "forgotten" | "hard" | "good" | "easy";

export interface ReviewQueueItem extends LearningItem {
  reviewKind: "due" | "new";
  dueAt: string | null;
}

export interface ReviewSummary {
  dueReviewedCount: number;
  newCount: number;
  totalAvailable: number;
  selectedItems: ReviewQueueItem[];
  nextDueAt: string | null;
}

export interface ConfirmedReviewRating {
  itemId: string;
  aiRating: ReviewRating;
  finalRating: ReviewRating;
}

export interface ConfirmReviewSessionInput {
  sessionId: string;
  reviewedAt: string;
  ratings: ConfirmedReviewRating[];
}

export interface ReviewHistoryEntry {
  id: string;
  sessionId: string;
  itemId: string;
  reviewedAt: string;
  aiRating: ReviewRating;
  finalRating: ReviewRating;
  intervalSeconds: number;
  nextDueAt: string;
}

export interface LearningItemReviewDetail {
  status: "new" | "due" | "scheduled";
  lastReviewedAt: string | null;
  lastFinalRating: ReviewRating | null;
  nextDueAt: string | null;
  reviewCount: number;
  history: ReviewHistoryEntry[];
}

export interface ConfirmReviewSessionResult {
  sessionId: string;
  reviewedAt: string;
  entries: ReviewHistoryEntry[];
  remainingAvailable: number;
}

export interface ReviewPaperQuestion {
  questionId: string;
  itemId: string;
  title: string;
  sense: string;
  cefr: LearningItem["cefr"];
  beforeTarget: string;
  targetText: string;
  afterTarget: string;
}

export interface ReviewPaper {
  paperId: string;
  questions: ReviewPaperQuestion[];
}

export interface ReviewAnswer {
  questionId: string;
  answer: string;
}

export interface ReviewGradeResult {
  questionId: string;
  itemId: string;
  feedback: string;
  rating: ReviewRating;
}

export interface ReviewGrade {
  paperId: string;
  results: ReviewGradeResult[];
}

export interface GenerateReviewPaperInput {
  explanationLanguage: "source" | "zh-TW" | "en" | "ja";
}

export interface GradeReviewPaperInput {
  paperId: string;
  answers: ReviewAnswer[];
}

export interface ConfirmReviewPaperInput {
  paperId: string;
  ratings: Array<{
    questionId: string;
    finalRating: ReviewRating;
  }>;
}

export interface ReviewGenerationProgress {
  phase: "preparing" | "assembling";
  completedCount: number;
  totalCount: number;
}

export interface ReviewDesktopApi {
  getSummary(): Promise<ReviewSummary>;
  generatePaper(input: GenerateReviewPaperInput): Promise<ReviewPaper>;
  gradePaper(input: GradeReviewPaperInput): Promise<ReviewGrade>;
  confirmPaper(input: ConfirmReviewPaperInput): Promise<ConfirmReviewSessionResult>;
  discardPaper(): Promise<void>;
  getItemDetail(itemId: string): Promise<LearningItemReviewDetail>;
  onGenerationProgress(
    listener: (progress: ReviewGenerationProgress) => void
  ): () => void;
}
