import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { createInterface, type Interface } from "node:readline";

export interface CodexNotification {
  method: string;
  params?: unknown;
}

export interface CodexAppServerClient {
  initialize(clientInfo: { name: string; title: string; version: string }): Promise<void>;
  readAccount(): Promise<{
    account: { type: string; email?: string } | null;
    requiresOpenaiAuth: boolean;
  }>;
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onNotification(listener: (notification: CodexNotification) => void): () => void;
  onExit(listener: (error: Error) => void): () => void;
  close(): void;
}

interface ClientOptions {
  requestTimeoutMs?: number;
  threadStartTimeoutMs?: number;
  spawnProcess?(): ChildProcessWithoutNullStreams;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findWindowsDesktopCodex(localAppData: string | undefined): string | null {
  if (!localAppData) return null;
  const directory = join(localAppData, "OpenAI", "Codex", "bin");
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const executable = join(directory, entry.name, "codex.exe");
        try {
          const stats = statSync(executable);
          return stats.isFile() ? { executable, modifiedAt: stats.mtimeMs } : null;
        } catch {
          return null;
        }
      })
      .filter((candidate): candidate is { executable: string; modifiedAt: number } =>
        candidate !== null
      )
      .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.executable ?? null;
  } catch {
    return null;
  }
}

export interface CodexLaunchSpec {
  command: string;
  args: string[];
  windowsHide?: boolean;
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveCodexLaunchSpec(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  isExecutable: (path: string) => boolean = executable
): CodexLaunchSpec {
  const explicit = environment.CODEX_PATH;
  if (explicit && isExecutable(explicit)) {
    return { command: explicit, args: ["app-server"], windowsHide: platform === "win32" };
  }
  if (platform === "win32") {
    const desktopCodex = findWindowsDesktopCodex(environment.LOCALAPPDATA);
    if (desktopCodex) {
      return { command: desktopCodex, args: ["app-server"], windowsHide: true };
    }
    return {
      command: environment.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "codex.cmd app-server"],
      windowsHide: true
    };
  }
  const pathCandidates = (environment.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, "codex"));
  const commonMacPaths = platform === "darwin"
    ? ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"]
    : [];
  const resolved = [...pathCandidates, ...commonMacPaths].find(isExecutable);
  return { command: resolved ?? "codex", args: ["app-server"] };
}

export function spawnCodexAppServer(): ChildProcessWithoutNullStreams {
  const launch = resolveCodexLaunchSpec();
  return spawn(launch.command, launch.args, {
    stdio: ["pipe", "pipe", "pipe"],
    ...(launch.windowsHide ? { windowsHide: true } : {})
  });
}

export class SpawnedCodexAppServerClient implements CodexAppServerClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #lines: Interface;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #events = new EventEmitter();
  readonly #requestTimeoutMs: number;
  readonly #threadStartTimeoutMs: number;
  #requestId = 0;
  #closed = false;

  constructor(options: ClientOptions = {}) {
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.#threadStartTimeoutMs = options.threadStartTimeoutMs ?? 30_000;
    this.#child = options.spawnProcess?.() ?? spawnCodexAppServer();
    this.#lines = createInterface({ input: this.#child.stdout });
    this.#lines.on("line", (line) => this.#handleLine(line));
    this.#child.once("error", (error) => this.#handleExit(error));
    this.#child.once("exit", (code) => this.#handleExit(
      new Error(`Codex app-server exited${code === null ? "" : ` with code ${code}`}.`)
    ));
  }

  async initialize(
    clientInfo: { name: string; title: string; version: string }
  ): Promise<void> {
    await this.#request("initialize", {
      clientInfo,
      capabilities: { experimentalApi: true, requestAttestation: false }
    });
    this.#write({ method: "initialized", params: {} });
  }

  async readAccount(): Promise<{
    account: { type: string; email?: string } | null;
    requiresOpenaiAuth: boolean;
  }> {
    const value = await this.#request("account/read", { refreshToken: false });
    if (!object(value) || typeof value.requiresOpenaiAuth !== "boolean") {
      throw new Error("Codex account/read returned unexpected data.");
    }
    if (value.account === null) {
      return { account: null, requiresOpenaiAuth: value.requiresOpenaiAuth };
    }
    if (!object(value.account) || typeof value.account.type !== "string") {
      throw new Error("Codex account/read returned an invalid account.");
    }
    return {
      requiresOpenaiAuth: value.requiresOpenaiAuth,
      account: {
        type: value.account.type,
        ...(typeof value.account.email === "string" ? { email: value.account.email } : {})
      }
    };
  }

  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.#request(method, params);
  }

  onNotification(listener: (notification: CodexNotification) => void): () => void {
    this.#events.on("notification", listener);
    return () => this.#events.off("notification", listener);
  }

  onExit(listener: (error: Error) => void): () => void {
    this.#events.on("exit", listener);
    return () => this.#events.off("exit", listener);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Codex app-server client closed."));
    }
    this.#pending.clear();
    this.#lines.close();
    this.#child.kill("SIGTERM");
  }

  #request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error("Codex client is closed."));
    const id = ++this.#requestId;
    const timeout = method === "thread/start"
      ? this.#threadStartTimeoutMs
      : this.#requestTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out waiting for Codex response to ${method}.`));
      }, timeout);
      this.#pending.set(id, { resolve, reject, timer });
      this.#write({ id, method, ...(params ? { params } : {}) });
    });
  }

  #write(message: Record<string, unknown>): void {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!object(message)) return;
    if (typeof message.id === "number" && typeof message.method !== "string") {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (object(message.error) && typeof message.error.message === "string") {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (typeof message.method === "string" && message.id === undefined) {
      this.#events.emit("notification", {
        method: message.method,
        ...(message.params !== undefined ? { params: message.params } : {})
      } satisfies CodexNotification);
    }
  }

  #handleExit(error: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    this.#events.emit("exit", error);
  }
}
