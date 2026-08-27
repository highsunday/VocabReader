import { describe, expect, it } from "vitest";
import { registerAppInfoIpc } from "./app-info-ipc";

describe("app info IPC", () => {
  it("returns the version reported by Electron", () => {
    const handlers = new Map<string, () => unknown>();

    registerAppInfoIpc({
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    }, () => "0.1.3");

    expect(handlers.get("app-info:get-version")?.()).toBe("0.1.3");
  });
});
