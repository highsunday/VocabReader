import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";

export interface CodexNotification {
  method: string;
  params?: unknown;
}

export interface AccountReadResult {
  account: { type: string; email?: string } | null;
  requiresOpenaiAuth: boolean;
}

export interface CodexAppServerClient {
  initialize(clientInfo: {
    name: string;
    title: string;
    version: string;
  }): Promise<void>;
  readAccount(): Promise<AccountReadResult>;
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

interface SpawnCodexAppServerOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  desktopExecutable?: string | null;
  spawnCommand?: typeof spawn;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAccount(value: unknown): AccountReadResult {
  if (!isObject(value) || typeof value.requiresOpenaiAuth !== "boolean") {
    throw new Error("Codex account/read returned unrecognized data.");
  }
  if (value.account === null) {
    return {
      account: null,
      requiresOpenaiAuth: value.requiresOpenaiAuth
    };
  }
  if (!isObject(value.account) || typeof value.account.type !== "string") {
    throw new Error("Codex account/read returned an invalid account.");
  }
  return {
    requiresOpenaiAuth: value.requiresOpenaiAuth,
    account: {
      type: value.account.type,
      ...(typeof value.account.email === "string"
        ? { email: value.account.email }
        : {})
    }
  };
}

export function findCodexDesktopExecutable(
  localAppData: string | undefined
): string | null {
  if (!localAppData) return null;
  const binDirectory = join(localAppData, "OpenAI", "Codex", "bin");
  try {
    return readdirSync(binDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const executable = join(binDirectory, entry.name, "codex.exe");
        try {
          const stat = statSync(executable);
          return stat.isFile()
            ? { executable, modifiedAt: stat.mtimeMs }
            : null;
        } catch {
          return null;
        }
      })
      .filter((candidate): candidate is {
        executable: string;
        modifiedAt: number;
      } => candidate !== null)
      .sort((left, right) =>
        right.modifiedAt - left.modifiedAt ||
        right.executable.localeCompare(left.executable)
      )[0]?.executable ?? null;
  } catch {
    return null;
  }
}

export function spawnCodexAppServer(
  options: SpawnCodexAppServerOptions = {}
): ChildProcessWithoutNullStreams {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const spawnCommand = options.spawnCommand ?? spawn;
  if (platform === "win32") {
    const desktopExecutable = options.desktopExecutable === undefined
      ? findCodexDesktopExecutable(environment.LOCALAPPDATA)
      : options.desktopExecutable;
    if (desktopExecutable) {
      return spawnCommand(desktopExecutable, ["app-server"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    }
    return spawnCommand(
      environment.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "codex.cmd app-server"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      }
    );
  }
  return spawnCommand("codex", ["app-server"], {
    stdio: ["pipe", "pipe", "pipe"]
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
    this.#child.once("exit", (code) => {
      this.#handleExit(new Error(
        `Codex app-server exited${code === null ? "" : ` (code ${code})`}.`
      ));
    });
  }

  async initialize(clientInfo: {
    name: string;
    title: string;
    version: string;
  }): Promise<void> {
    await this.#request("initialize", {
      clientInfo,
      capabilities: { experimentalApi: true, requestAttestation: false }
    });
    this.#write({ method: "initialized", params: {} });
  }

  async readAccount(): Promise<AccountReadResult> {
    return parseAccount(await this.#request("account/read", {
      refreshToken: false
    }));
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
      pending.reject(new Error("The Codex app-server connection is closed."));
    }
    this.#pending.clear();
    this.#lines.close();
    this.#child.kill("SIGTERM");
  }

  #request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(new Error("The Codex app-server connection is closed."));
    }
    const id = ++this.#requestId;
    const timeoutMs = method === "thread/start"
      ? this.#threadStartTimeoutMs
      : this.#requestTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out waiting for Codex ${method}.`));
      }, timeoutMs);
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
    if (!isObject(message)) return;

    if (typeof message.id === "number" && typeof message.method !== "string") {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (isObject(message.error) && typeof message.error.message === "string") {
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
