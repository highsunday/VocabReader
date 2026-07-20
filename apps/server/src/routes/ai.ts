import type { FastifyPluginAsync } from "fastify";
import type {
  AiChatRequest,
  ChapterPracticeRequest,
  SpacedReviewRequest
} from "../services/ai-gateway.js";

interface ChapterParams {
  chapterId: string;
}

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: AiChatRequest }>("/api/v1/ai/chat", async (request) => {
    return app.aiGateway.chat(request.body);
  });

  app.post<{
    Params: ChapterParams;
    Body: Omit<ChapterPracticeRequest, "chapterId">;
  }>("/api/v1/chapters/:chapterId/practice", async (request) => {
    return {
      questions: await app.aiGateway.createChapterPractice({
        chapterId: request.params.chapterId,
        annotationIds: request.body.annotationIds,
        ...(request.body.questionCount === undefined
          ? {}
          : { questionCount: request.body.questionCount })
      })
    };
  });

  app.post<{ Body: SpacedReviewRequest }>(
    "/api/v1/reviews/sessions",
    async (request) => {
      return {
        exercises: await app.aiGateway.createSpacedReview(request.body)
      };
    }
  );
};

