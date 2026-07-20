import type { FastifyPluginAsync } from "fastify";

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    service: "reader-server"
  }));

  app.get("/api/v1/system/capabilities", async () => ({
    epubImport: false,
    chapterAnnotations: false,
    chapterPractice: false,
    spacedReview: false,
    aiGateway: "unconfigured"
  }));
};

