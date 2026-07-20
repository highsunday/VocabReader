import "fastify";
import type { AiGateway } from "./services/ai-gateway.js";

declare module "fastify" {
  interface FastifyInstance {
    aiGateway: AiGateway;
  }
}

