import { describe, expect, it, vi } from "vitest";
import { registerDataBackupIpc } from "./data-backup-ipc";

describe("data backup IPC", () => {
  it("owns native paths and exposes only named backup capabilities", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      })
    };
    const dialog = {
      showSaveDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePath: "/chosen/VocabReader-backup"
      }),
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ["/chosen/source.zip"]
      })
    };
    const preview = {
      token: "preview-token",
      createdAt: "2026-07-28T03:04:05.000Z",
      appVersion: "0.1.0",
      books: 2,
      activeLearningItems: 8,
      trashedLearningItems: 1
    };
    const service = {
      exportToPath: vi.fn().mockResolvedValue({
        status: "exported",
        fileName: "VocabReader-backup.zip"
      }),
      selectBackupFromPath: vi.fn().mockResolvedValue(preview),
      cancelRestore: vi.fn().mockResolvedValue(undefined),
      restoreBackup: vi.fn().mockResolvedValue(undefined)
    };

    registerDataBackupIpc(
      ipc,
      dialog,
      service,
      "VocabReader-backup-2026-07-28-110000.zip"
    );

    expect([...handlers.keys()].sort()).toEqual([
      "data-backup:cancel-restore",
      "data-backup:export",
      "data-backup:restore",
      "data-backup:select"
    ]);
    await expect(
      handlers.get("data-backup:export")?.({}, "/renderer/cannot/choose.zip")
    ).resolves.toEqual({
      status: "exported",
      fileName: "VocabReader-backup.zip"
    });
    expect(dialog.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: "VocabReader-backup-2026-07-28-110000.zip",
      filters: [{ name: "VocabReader 資料備份", extensions: ["zip"] }]
    }));
    expect(service.exportToPath)
      .toHaveBeenCalledWith("/chosen/VocabReader-backup.zip");

    await expect(handlers.get("data-backup:select")?.()).resolves.toEqual({
      status: "ready",
      preview
    });
    expect(service.selectBackupFromPath).toHaveBeenCalledWith(
      "/chosen/source.zip"
    );
    await expect(
      handlers.get("data-backup:cancel-restore")?.({}, "preview-token")
    ).resolves.toBeUndefined();
    await expect(
      handlers.get("data-backup:restore")?.({}, "preview-token")
    ).resolves.toBeUndefined();
    expect(service.cancelRestore).toHaveBeenCalledWith("preview-token");
    expect(service.restoreBackup).toHaveBeenCalledWith("preview-token");
  });

  it("returns dialog cancellation and rejects malformed preview tokens", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      }
    };
    const dialog = {
      showSaveDialog: vi.fn().mockResolvedValue({
        canceled: true,
        filePath: undefined
      }),
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: true,
        filePaths: []
      })
    };
    const service = {
      exportToPath: vi.fn(),
      selectBackupFromPath: vi.fn(),
      cancelRestore: vi.fn(),
      restoreBackup: vi.fn()
    };
    registerDataBackupIpc(ipc, dialog, service, "backup.zip");

    await expect(handlers.get("data-backup:export")?.()).resolves.toEqual({
      status: "cancelled"
    });
    await expect(handlers.get("data-backup:select")?.()).resolves.toEqual({
      status: "cancelled"
    });
    expect(service.exportToPath).not.toHaveBeenCalled();
    expect(service.selectBackupFromPath).not.toHaveBeenCalled();
    expect(() =>
      handlers.get("data-backup:restore")?.({}, "../invalid")
    ).toThrow(/還原請求格式錯誤/);
    expect(() =>
      handlers.get("data-backup:cancel-restore")?.({}, 42)
    ).toThrow(/還原請求格式錯誤/);
    expect(service.restoreBackup).not.toHaveBeenCalled();
    expect(service.cancelRestore).not.toHaveBeenCalled();
  });
});
