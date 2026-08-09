import {
  LISTEN_REPEAT_RECORDING_LIMIT,
  isListenRepeatMode
} from "../shared/listen-repeat-contracts";
import type { ListenRepeatController } from "./listen-repeat-controller";

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 &&
    !value.includes("/") && !value.includes("\\") && !value.includes("..");
}

function audioInput(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.byteLength > 0 &&
    value.byteLength <= LISTEN_REPEAT_RECORDING_LIMIT;
}

export function registerListenRepeatIpc(
  ipc: IpcRegistrar,
  controller: ListenRepeatController
): void {
  ipc.handle("listen-repeat:snapshot", () => controller.getSnapshot());
  ipc.handle("listen-repeat:draft", (_event, raw) => {
    if (!isObject(raw) || typeof raw.material !== "string" ||
      raw.material.length > 20_000 || !isListenRepeatMode(raw.mode)) {
      throw new Error("Invalid listen-and-repeat draft request");
    }
    return controller.saveDraft({ material: raw.material, mode: raw.mode });
  });
  ipc.handle("listen-repeat:process", (_event, raw) => {
    if (!isObject(raw) || typeof raw.material !== "string" ||
      !isListenRepeatMode(raw.mode) ||
      (raw.replaceConfirmed !== undefined &&
        typeof raw.replaceConfirmed !== "boolean")) {
      throw new Error("Invalid listen-and-repeat process request");
    }
    return controller.process({
      material: raw.material,
      mode: raw.mode,
      ...(typeof raw.replaceConfirmed === "boolean"
        ? { replaceConfirmed: raw.replaceConfirmed } : {})
    });
  });
  ipc.handle("listen-repeat:save-recording", (_event, raw) => {
    if (!isObject(raw) || !safeId(raw.practiceId) || !safeId(raw.chunkId) ||
      typeof raw.mimeType !== "string" || !raw.mimeType.startsWith("audio/") ||
      !audioInput(raw.audio)) {
      throw new Error("Invalid listen-and-repeat recording request");
    }
    return controller.saveRecording({
      practiceId: raw.practiceId,
      chunkId: raw.chunkId,
      mimeType: raw.mimeType,
      audio: raw.audio
    });
  });
  ipc.handle("listen-repeat:recording", (_event, raw) => {
    if (!isObject(raw) || !safeId(raw.practiceId) || !safeId(raw.chunkId)) {
      throw new Error("Invalid listen-and-repeat recording request");
    }
    return controller.getRecording(raw.practiceId, raw.chunkId);
  });
  ipc.handle("listen-repeat:ai-audio", (_event, raw) => {
    if (!isObject(raw) || !safeId(raw.practiceId) || !safeId(raw.chunkId)) {
      throw new Error("Invalid listen-and-repeat AI audio request");
    }
    return controller.prepareAiAudio(raw.practiceId, raw.chunkId);
  });
  ipc.handle("listen-repeat:cancel-ai-audio", (_event, raw) => {
    if (!isObject(raw) || !safeId(raw.practiceId) ||
      (raw.chunkId !== undefined && !safeId(raw.chunkId))) {
      throw new Error("Invalid listen-and-repeat AI audio cancellation");
    }
    controller.cancelAiAudio(raw.practiceId, raw.chunkId as string | undefined);
  });
  ipc.handle("listen-repeat:clear", () => controller.clear());
}
