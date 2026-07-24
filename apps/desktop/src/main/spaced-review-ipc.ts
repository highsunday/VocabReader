import type { SpacedReviewController } from "./spaced-review-controller";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): unknown;
}

interface ReviewIpcEvent {
  sender: {
    send(channel: string, payload: unknown): void;
    isDestroyed?(): boolean;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function visibleGenerationProgress(text: string): string {
  const artifactStart = text.indexOf("```review-paper");
  return (artifactStart >= 0 ? text.slice(0, artifactStart) : text).trim();
}

export function registerSpacedReviewIpc(
  ipc: IpcRegistrar,
  controller: SpacedReviewController
): void {
  ipc.handle("review:summary", () => controller.getSummary());
  ipc.handle("review:generate", (event, input) => {
    if (!isObject(input) ||
      !["source", "zh-TW", "en", "ja"].includes(
        input.explanationLanguage as string
      )) {
      throw new Error("複習試卷生成格式錯誤");
    }
    const sender = (event as ReviewIpcEvent).sender;
    let lastProgress = "";
    return controller.generatePaper(
      {
        explanationLanguage: input.explanationLanguage as
          "source" | "zh-TW" | "en" | "ja"
      },
      (text) => {
        const visibleText = visibleGenerationProgress(text);
        if (visibleText && visibleText !== lastProgress &&
          !sender.isDestroyed?.()) {
          lastProgress = visibleText;
          sender.send("review:generation-progress", { text: visibleText });
        }
      }
    );
  });
  ipc.handle("review:grade", (_event, input) => {
    if (!isObject(input) || typeof input.paperId !== "string" ||
      !Array.isArray(input.answers) ||
      input.answers.some((answer) =>
        !isObject(answer) ||
        typeof answer.questionId !== "string" ||
        typeof answer.answer !== "string"
      )) {
      throw new Error("複習試卷作答格式錯誤");
    }
    return controller.gradePaper({
      paperId: input.paperId,
      answers: input.answers.map((answer) => ({
        questionId: answer.questionId as string,
        answer: answer.answer as string
      }))
    });
  });
  ipc.handle("review:confirm", (_event, input) => {
    if (!isObject(input) || typeof input.paperId !== "string" ||
      !Array.isArray(input.ratings) ||
      input.ratings.some((rating) =>
        !isObject(rating) ||
        typeof rating.questionId !== "string" ||
        !["forgotten", "hard", "good", "easy"].includes(
          rating.finalRating as string
        )
      )) {
      throw new Error("複習評級確認格式錯誤");
    }
    return controller.confirmPaper({
      paperId: input.paperId,
      ratings: input.ratings.map((rating) => ({
        questionId: rating.questionId as string,
        finalRating: rating.finalRating as
          "forgotten" | "hard" | "good" | "easy"
      }))
    });
  });
  ipc.handle("review:discard", () => controller.discardPaper());
  ipc.handle("review:item-detail", (_event, itemId) => {
    if (typeof itemId !== "string" || !itemId.trim()) {
      throw new Error("學習項目請求格式錯誤");
    }
    return controller.getItemDetail(itemId);
  });
}
