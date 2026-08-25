import { SENTENCE_PRACTICE_ITEM_COUNT } from "../shared/sentence-practice-contracts";
import type { SentencePracticeController } from "./sentence-practice-controller";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function registerSentencePracticeIpc(
  ipc: IpcRegistrar,
  controller: SentencePracticeController
): void {
  ipc.handle("sentence-practice:snapshot", () => controller.getSnapshot());
  ipc.handle("sentence-practice:start", (_event, input) => {
    if (!isObject(input) || !Number.isSafeInteger(input.itemCount) ||
      (input.itemCount as number) < SENTENCE_PRACTICE_ITEM_COUNT.minimum ||
      (input.itemCount as number) > SENTENCE_PRACTICE_ITEM_COUNT.maximum) {
      throw new Error("Invalid sentence-practice start request");
    }
    return controller.startSession({ itemCount: input.itemCount as number });
  });
  ipc.handle("sentence-practice:submit", (_event, input) => {
    if (!isObject(input) || typeof input.sessionId !== "string" ||
      !input.sessionId.trim() || typeof input.draft !== "string" ||
      !["source", "zh-TW", "en", "ja"].includes(
        input.explanationLanguage as string
      )) {
      throw new Error("Invalid sentence-practice submission request");
    }
    return controller.submit({
      sessionId: input.sessionId,
      draft: input.draft,
      explanationLanguage: input.explanationLanguage as
        "source" | "zh-TW" | "en" | "ja" | "ko"
    });
  });
  ipc.handle("sentence-practice:examples", (_event, input) => {
    if (!isObject(input) || typeof input.sessionId !== "string" ||
      !input.sessionId.trim() || !["source", "zh-TW", "en", "ja"].includes(
        input.explanationLanguage as string
      )) {
      throw new Error("Invalid sentence-practice examples request");
    }
    return controller.generateExamples({
      sessionId: input.sessionId,
      explanationLanguage: input.explanationLanguage as
        "source" | "zh-TW" | "en" | "ja" | "ko"
    });
  });
}
