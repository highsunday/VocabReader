import type { FastifyPluginAsync } from "fastify";

interface DueReviewQuery {
  limit?: string;
}

export const libraryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/books", async () => ({
    books: []
  }));

  app.get<{ Querystring: DueReviewQuery }>(
    "/api/v1/reviews/due",
    async (request) => {
      const requestedLimit = Number(request.query.limit ?? 10);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
        : 10;

      return {
        items: [],
        limit
      };
    }
  );
};

