import { describe, expect, it, vi } from "vitest";
import { restartAfterDataRestore } from "./data-restore-restart";

describe("restartAfterDataRestore", () => {
  it("reloads existing windows without exiting when the renderer is served by Vite", () => {
    const deferred: Array<() => void> = [];
    const reloadWindows = vi.fn();
    const relaunch = vi.fn();
    const exit = vi.fn();

    restartAfterDataRestore({
      developmentServerUrl: "http://127.0.0.1:5173",
      reloadWindows,
      relaunch,
      exit,
      defer: (callback) => deferred.push(callback)
    });

    expect(relaunch).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(reloadWindows).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);

    deferred[0]();

    expect(reloadWindows).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });

  it("relaunches the packaged app and exits the current process", () => {
    const deferred: Array<() => void> = [];
    const reloadWindows = vi.fn();
    const relaunch = vi.fn();
    const exit = vi.fn();

    restartAfterDataRestore({
      developmentServerUrl: undefined,
      reloadWindows,
      relaunch,
      exit,
      defer: (callback) => deferred.push(callback)
    });

    expect(relaunch).toHaveBeenCalledOnce();
    expect(reloadWindows).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);

    deferred[0]();

    expect(exit).toHaveBeenCalledOnce();
    expect(reloadWindows).not.toHaveBeenCalled();
  });
});
