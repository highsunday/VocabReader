import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

export interface RecordedRequest {
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

export function createFakeCodexAppServer(): {
  child: ChildProcessWithoutNullStreams;
  requests: RecordedRequest[];
} {
  const child = new EventEmitter() as EventEmitter & Partial<ChildProcessWithoutNullStreams>;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: RecordedRequest[] = [];
  let buffer = "";
  let turnCount = 0;
  Object.assign(child, { stdin, stdout, stderr, kill: () => true });

  stdin.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const message = JSON.parse(line) as RecordedRequest;
      requests.push(message);
      if (typeof message.id !== "number") continue;
      if (message.method === "initialize") {
        stdout.write(`${JSON.stringify({ id: message.id, result: {} })}\n`);
      } else if (message.method === "account/read") {
        stdout.write(`${JSON.stringify({
          id: message.id,
          result: {
            account: { type: "chatgpt", email: "reader@example.com" },
            requiresOpenaiAuth: true
          }
        })}\n`);
      } else if (message.method === "account/rateLimits/read") {
        stdout.write(`${JSON.stringify({
          id: message.id,
          result: {
            rateLimits: null,
            rateLimitsByLimitId: {
              codex: {
                primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_800_000_000 },
                secondary: { usedPercent: 38, windowDurationMins: 10_080, resetsAt: 1_800_500_000 }
              }
            }
          }
        })}\n`);
      } else if (message.method === "thread/start") {
        stdout.write(`${JSON.stringify({
          id: message.id,
          result: { thread: { id: "reader-thread-1" } }
        })}\n`);
      } else if (message.method === "turn/start") {
        const turnId = `turn-${++turnCount}`;
        const itemId = `answer-${turnCount}`;
        stdout.write(`${JSON.stringify({
          id: message.id,
          result: { turn: { id: turnId } }
        })}\n`);
        setTimeout(() => {
          stdout.write(`${JSON.stringify({
            method: "turn/started",
            params: { threadId: "reader-thread-1", turn: { id: turnId } }
          })}\n`);
          stdout.write(`${JSON.stringify({
            method: "item/agentMessage/delta",
            params: {
              threadId: "reader-thread-1",
              turnId,
              itemId,
              delta: "The marked passage "
            }
          })}\n`);
          stdout.write(`${JSON.stringify({
            method: "item/agentMessage/delta",
            params: {
              threadId: "reader-thread-1",
              turnId,
              itemId,
              delta: "explains the concept."
            }
          })}\n`);
          stdout.write(`${JSON.stringify({
            method: "item/completed",
            params: {
              threadId: "reader-thread-1",
              turnId,
              item: {
                type: "agentMessage",
                id: itemId,
                text: "The marked passage explains the concept."
              }
            }
          })}\n`);
          stdout.write(`${JSON.stringify({
            method: "turn/completed",
            params: {
              threadId: "reader-thread-1",
              turn: { id: turnId, status: "completed", error: null }
            }
          })}\n`);
        }, 0);
      }
    }
  });

  return { child: child as ChildProcessWithoutNullStreams, requests };
}
