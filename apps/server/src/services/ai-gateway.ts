export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  messages: ChatMessage[];
  context?: {
    bookId?: string;
    chapterId?: string;
    annotationIds?: string[];
  };
}

export interface AiChatResponse {
  message: ChatMessage;
}

export interface ChapterPracticeRequest {
  chapterId: string;
  annotationIds: string[];
  questionCount?: number;
}

export interface ChapterPracticeQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctChoiceIndex: number;
  explanation: string;
}

export interface SpacedReviewRequest {
  learningItemIds: string[];
}

export interface SpacedReviewExercise {
  id: string;
  learningItemId: string;
  type: "fill-blank" | "sentence-writing";
  prompt: string;
}

export interface AiGateway {
  chat(request: AiChatRequest): Promise<AiChatResponse>;
  createChapterPractice(
    request: ChapterPracticeRequest
  ): Promise<ChapterPracticeQuestion[]>;
  createSpacedReview(
    request: SpacedReviewRequest
  ): Promise<SpacedReviewExercise[]>;
}

export class AiGatewayUnavailableError extends Error {
  readonly code = "AI_GATEWAY_NOT_CONFIGURED";

  constructor() {
    super(
      "Codex AI gateway is not configured. Implement AiGateway after the Codex Server App protocol is confirmed."
    );
    this.name = "AiGatewayUnavailableError";
  }
}

export class UnconfiguredAiGateway implements AiGateway {
  async chat(_request: AiChatRequest): Promise<AiChatResponse> {
    throw new AiGatewayUnavailableError();
  }

  async createChapterPractice(
    _request: ChapterPracticeRequest
  ): Promise<ChapterPracticeQuestion[]> {
    throw new AiGatewayUnavailableError();
  }

  async createSpacedReview(
    _request: SpacedReviewRequest
  ): Promise<SpacedReviewExercise[]> {
    throw new AiGatewayUnavailableError();
  }
}

