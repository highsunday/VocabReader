import { describe, expect, it, vi } from "vitest";
import type { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findCodexDesktopExecutable,
  spawnCodexAppServer
} from "./codex-app-server-client";

function childProcessFixture(): ChildProcessWithoutNullStreams {
  return {} as ChildProcessWithoutNullStreams;
}

describe("spawnCodexAppServer", () => {
  it("launches the Codex Desktop native executable on Windows", () => {
    const child = childProcessFixture();
    const spawnCommand = vi.fn(() => child) as unknown as typeof spawn;

    const result = spawnCodexAppServer({
      platform: "win32",
      desktopExecutable:
        "C:\\Users\\reader\\AppData\\Local\\OpenAI\\Codex\\bin\\current\\codex.exe",
      spawnCommand
    });

    expect(result).toBe(child);
    expect(spawnCommand).toHaveBeenCalledWith(
      "C:\\Users\\reader\\AppData\\Local\\OpenAI\\Codex\\bin\\current\\codex.exe",
      ["app-server"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      }
    );
  });

  it("uses the Windows command processor to launch the npm codex shim", () => {
    const child = childProcessFixture();
    const spawnCommand = vi.fn(() => child) as unknown as typeof spawn;

    const result = spawnCodexAppServer({
      platform: "win32",
      environment: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      desktopExecutable: null,
      spawnCommand
    });

    expect(result).toBe(child);
    expect(spawnCommand).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "codex.cmd app-server"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      }
    );
  });

  it("launches codex directly outside Windows", () => {
    const child = childProcessFixture();
    const spawnCommand = vi.fn(() => child) as unknown as typeof spawn;

    const result = spawnCodexAppServer({
      platform: "linux",
      environment: {},
      spawnCommand
    });

    expect(result).toBe(child);
    expect(spawnCommand).toHaveBeenCalledWith(
      "codex",
      ["app-server"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
  });
});

describe("findCodexDesktopExecutable", () => {
  it("selects the newest installed Codex Desktop executable", () => {
    const localAppData = mkdtempSync(join(tmpdir(), "vocabreader-codex-"));
    const older = join(
      localAppData,
      "OpenAI",
      "Codex",
      "bin",
      "older",
      "codex.exe"
    );
    const newer = join(
      localAppData,
      "OpenAI",
      "Codex",
      "bin",
      "newer",
      "codex.exe"
    );
    try {
      mkdirSync(join(older, ".."), { recursive: true });
      mkdirSync(join(newer, ".."), { recursive: true });
      writeFileSync(older, "");
      writeFileSync(newer, "");
      utimesSync(older, new Date(1_000), new Date(1_000));
      utimesSync(newer, new Date(2_000), new Date(2_000));

      expect(findCodexDesktopExecutable(localAppData)).toBe(newer);
    } finally {
      rmSync(localAppData, { recursive: true, force: true });
    }
  });

  it("returns null when Codex Desktop is not installed", () => {
    expect(findCodexDesktopExecutable(undefined)).toBeNull();
  });
});
