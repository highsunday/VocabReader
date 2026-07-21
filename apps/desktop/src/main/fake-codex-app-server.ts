import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

export interface RecordedCodexRequest {
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface FakeCodexOptions {
  accountResult?: unknown;
  rateLimitsResult?: unknown;
  threadStartDelayMs?: number;
  turnDelayMs?: number;
}

export function createFakeCodexAppServer(options: FakeCodexOptions = {}) {
  const events = new EventEmitter() as EventEmitter &
    Partial<ChildProcessWithoutNullStreams>;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: RecordedCodexRequest[] = [];
  const killSignals: (NodeJS.Signals | number | undefined)[] = [];
  let buffer = "";
  let turnCount = 0;

  Object.assign(events, {
    stdin,
    stdout,
    stderr,
    kill: (signal?: NodeJS.Signals | number) => {
      killSignals.push(signal);
      return true;
    }
  });

  stdin.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const message = JSON.parse(line) as RecordedCodexRequest;
      requests.push(message);
      if (typeof message.id !== "number") continue;

      if (message.method === "initialize") {
        respond(message.id, { serverInfo: { version: "fake-1.0.0" } });
      } else if (message.method === "account/read") {
        respond(message.id, options.accountResult ?? {
          account: { type: "plus", email: "learner@example.com" },
          requiresOpenaiAuth: true
        });
      } else if (message.method === "account/rateLimits/read") {
        respond(message.id, options.rateLimitsResult ?? {
          rateLimits: allowanceSnapshot(10, 20),
          rateLimitsByLimitId: { codex: allowanceSnapshot(24, 38) }
        });
      } else if (message.method === "thread/start") {
        setTimeout(() => {
          respond(message.id as number, { thread: { id: "thread-1" } });
        }, options.threadStartDelayMs ?? 0);
      } else if (message.method === "turn/start") {
        const turnId = `turn-${++turnCount}`;
        const input = Array.isArray(message.params?.input)
          ? message.params.input[0]
          : undefined;
        const prompt = input && typeof input === "object" && "text" in input &&
          typeof input.text === "string"
          ? input.text
          : "";
        const answer = `Fake Codex answer to: ${prompt}`;
        const itemId = `assistant-${turnCount}`;
        respond(message.id, { turn: { id: turnId } });
        setTimeout(() => {
          notify("turn/started", {
            threadId: "thread-1",
            turn: { id: turnId }
          });
          notify("item/agentMessage/delta", {
            threadId: "thread-1",
            turnId,
            itemId,
            delta: answer.slice(0, 12)
          });
          notify("item/agentMessage/delta", {
            threadId: "thread-1",
            turnId,
            itemId,
            delta: answer.slice(12)
          });
          notify("item/completed", {
            threadId: "thread-1",
            turnId,
            item: { type: "agentMessage", id: itemId, text: answer }
          });
          notify("turn/completed", {
            threadId: "thread-1",
            turn: { id: turnId, status: "completed", error: null }
          });
        }, options.turnDelayMs ?? 0);
      }
    }
  });

  function respond(id: number, result: unknown) {
    stdout.write(`${JSON.stringify({ id, result })}\n`);
  }

  function notify(method: string, params: unknown) {
    stdout.write(`${JSON.stringify({ method, params })}\n`);
  }

  return {
    child: events as ChildProcessWithoutNullStreams,
    requests,
    killSignals,
    emitNotification: notify
  };
}

function allowanceSnapshot(fiveHourUsed: number, weeklyUsed: number) {
  return {
    limitId: "codex",
    primary: {
      usedPercent: weeklyUsed,
      windowDurationMins: 10_080,
      resetsAt: 1_800_000_000
    },
    secondary: {
      usedPercent: fiveHourUsed,
      windowDurationMins: 300,
      resetsAt: 1_700_000_000
    },
    rateLimitReachedType: null
  };
}
