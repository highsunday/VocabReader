import type { GenerateLearningCardsInput } from "../shared/learning-contracts";
import type { LearningProposalController } from "./learning-proposal-controller";

export function registerLearningProposalIpc(ipc: { handle(channel: string, listener: (...args: unknown[]) => unknown): unknown }, controller: LearningProposalController) {
  ipc.handle("learning:generate-proposals", (_event, input) => {
    if (!input || typeof input !== "object") throw new Error("學習卡提案格式錯誤");
    const value = input as Partial<GenerateLearningCardsInput>;
    if (typeof value.bookId !== "string" || typeof value.bookTitle !== "string" || typeof value.chapterId !== "string" || typeof value.chapterTitle !== "string" || typeof value.readingSegment !== "string" || !Array.isArray(value.sources) || !["source", "zh-TW", "en", "ja"].includes(String(value.explanationLanguage))) throw new Error("學習卡提案格式錯誤");
    return controller.generate(value as GenerateLearningCardsInput);
  });
}
