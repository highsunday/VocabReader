import type { LearningItemEditController } from "./learning-item-edit-controller";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): unknown;
}

function text(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

export function registerLearningItemEditIpc(
  ipc: IpcRegistrar,
  controller: LearningItemEditController
): void {
  ipc.handle("learning-edit:start", (_event, itemId) => {
    if (!text(itemId)) throw new Error("Invalid AI edit item");
    return controller.start(itemId);
  });
  ipc.handle("learning-edit:send", (_event, sessionId, request) => {
    if (!text(sessionId) || !text(request)) throw new Error("Invalid AI edit request");
    return controller.send(sessionId, request);
  });
  ipc.handle("learning-edit:stop", (_event, sessionId) => {
    if (!text(sessionId)) throw new Error("Invalid AI edit session");
    return controller.stop(sessionId);
  });
  ipc.handle("learning-edit:apply", (_event, sessionId) => {
    if (!text(sessionId)) throw new Error("Invalid AI edit session");
    return controller.apply(sessionId);
  });
  ipc.handle("learning-edit:discard", (_event, sessionId) => {
    if (!text(sessionId)) throw new Error("Invalid AI edit session");
    return controller.discard(sessionId);
  });
}
