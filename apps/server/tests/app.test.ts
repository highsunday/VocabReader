import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type {
  AiGateway,
  AiChatRequest,
  ChapterPracticeRequest,
  SpacedReviewRequest
} from "../src/services/ai-gateway.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("reader server", () => {
  it("reports health", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "vocab-reader-server"
    });
  });

  it("fails explicitly while the Codex gateway is unconfigured", async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/chat",
      payload: {
        messages: [{ role: "user", content: "Explain this sentence." }]
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "AI_GATEWAY_NOT_CONFIGURED"
    });
  });

  it("keeps chapter practice and spaced review as separate gateway calls", async () => {
    const calls: string[] = [];
    const gateway: AiGateway = {
      async chat(_request: AiChatRequest) {
        return {
          message: { role: "assistant", content: "Ready" }
        };
      },
      async createChapterPractice(_request: ChapterPracticeRequest) {
        calls.push("chapter-practice");
        return [];
      },
      async createSpacedReview(_request: SpacedReviewRequest) {
        calls.push("spaced-review");
        return [];
      }
    };
    const app = await buildApp({ aiGateway: gateway });
    apps.push(app);

    const chapterResponse = await app.inject({
      method: "POST",
      url: "/api/v1/chapters/chapter-1/practice",
      payload: { annotationIds: ["annotation-1"] }
    });
    const reviewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/reviews/sessions",
      payload: { learningItemIds: ["learning-item-1"] }
    });

    expect(chapterResponse.statusCode).toBe(200);
    expect(reviewResponse.statusCode).toBe(200);
    expect(calls).toEqual(["chapter-practice", "spaced-review"]);
  });
});
