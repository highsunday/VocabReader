import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { aiRoutes } from "./routes/ai.js";
import { libraryRoutes } from "./routes/library.js";
import { systemRoutes } from "./routes/system.js";
import {
  AiGatewayUnavailableError,
  type AiGateway,
  UnconfiguredAiGateway
} from "./services/ai-gateway.js";

export interface BuildAppOptions {
  aiGateway?: AiGateway;
  logger?: boolean;
}

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false
  });

  app.decorate("aiGateway", options.aiGateway ?? new UnconfiguredAiGateway());

  await app.register(cors, {
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"]
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AiGatewayUnavailableError) {
      return reply.status(503).send({
        error: error.code,
        message: error.message
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred."
    });
  });

  await app.register(systemRoutes);
  await app.register(libraryRoutes);
  await app.register(aiRoutes);

  return app;
}

