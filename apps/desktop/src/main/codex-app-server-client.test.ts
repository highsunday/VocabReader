import { describe, expect, it, vi } from "vitest";
import type { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  findCodexDesktopExecutable,
  findMacOSCodexExecutable,
  SpawnedCodexAppServerClient,
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

  it("launches the discovered macOS Codex executable by absolute path", () => {
    const child = childProcessFixture();
    const spawnCommand = vi.fn(() => child) as unknown as typeof spawn;

    const result = spawnCodexAppServer({
      platform: "darwin",
      macExecutable: "/Applications/ChatGPT.app/Contents/Resources/codex",
      spawnCommand
    });

    expect(result).toBe(child);
    expect(spawnCommand).toHaveBeenCalledWith(
      "/Applications/ChatGPT.app/Contents/Resources/codex",
      ["app-server"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
  });
});

describe("findMacOSCodexExecutable", () => {
  it("finds the executable bundled with the system ChatGPT app", () => {
    const root = mkdtempSync(join(tmpdir(), "vocabreader-macos-codex-"));
    const applicationsDirectory = join(root, "Applications");
    const homeDirectory = join(root, "home");
    const executable = join(
      applicationsDirectory,
      "ChatGPT.app",
      "Contents",
      "Resources",
      "codex"
    );
    try {
      mkdirSync(join(executable, ".."), { recursive: true });
      writeFileSync(executable, "");
      chmodSync(executable, 0o755);

      expect(findMacOSCodexExecutable({
        applicationsDirectory,
        homeDirectory,
        fallbackBinDirectories: []
      })).toBe(executable);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to a user-local Codex CLI when no desktop app exists", () => {
    const root = mkdtempSync(join(tmpdir(), "vocabreader-macos-codex-"));
    const applicationsDirectory = join(root, "Applications");
    const homeDirectory = join(root, "home");
    const binDirectory = join(homeDirectory, ".local", "bin");
    const executable = join(binDirectory, "codex");
    try {
      mkdirSync(binDirectory, { recursive: true });
      writeFileSync(executable, "");
      chmodSync(executable, 0o755);

      expect(findMacOSCodexExecutable({
        applicationsDirectory,
        homeDirectory,
        fallbackBinDirectories: [binDirectory]
      })).toBe(executable);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("SpawnedCodexAppServerClient launch errors", () => {
  it("turns ENOENT into an actionable Codex installation message", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn()
    }) as unknown as ChildProcessWithoutNullStreams;
    const client = new SpawnedCodexAppServerClient({
      spawnProcess: () => child,
      requestTimeoutMs: 100
    });
    const initialization = client.initialize({
      name: "vocab-reader",
      title: "VocabReader",
      version: "0.1.2"
    });
    const error = Object.assign(new Error("spawn codex ENOENT"), {
      code: "ENOENT"
    });

    child.emit("error", error);

    await expect(initialization).rejects.toThrow(
      /Install the ChatGPT\/Codex desktop app or Codex CLI.*restart VocabReader/i
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
