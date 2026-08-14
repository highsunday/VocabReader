import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveCodexLaunchSpec } from "../src/main/codex-app-server-client";

test("uses CODEX_PATH when an Electron GUI environment has no useful PATH", () => {
  const launch = resolveCodexLaunchSpec(
    "darwin",
    { CODEX_PATH: "/Applications/Codex.app/Contents/Resources/codex" },
    (path) => path === "/Applications/Codex.app/Contents/Resources/codex"
  );
  assert.deepEqual(launch, {
    command: "/Applications/Codex.app/Contents/Resources/codex",
    args: ["app-server"],
    windowsHide: false
  });
});

test("finds Homebrew Codex when macOS GUI PATH omits Homebrew", () => {
  const launch = resolveCodexLaunchSpec(
    "darwin",
    { PATH: "/usr/bin:/bin" },
    (path) => path === "/opt/homebrew/bin/codex"
  );
  assert.equal(launch.command, "/opt/homebrew/bin/codex");
  assert.deepEqual(launch.args, ["app-server"]);
});
