import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("dev mode uses one dedicated strict port for Vite, readiness, and Electron", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as { scripts: { dev: string } };
  const script = packageJson.scripts.dev;

  assert.match(script, /vite --host 127\.0\.0\.1 --port 45173 --strictPort/);
  assert.match(script, /wait-on tcp:45173/);
  assert.match(script, /VITE_DEV_SERVER_URL=http:\/\/127\.0\.0\.1:45173/);
  assert.doesNotMatch(script, /(?<!\d)5173(?!\d)/);
});

test("the renderer CSP allows Vite to inject development styles", () => {
  const html = readFileSync(
    new URL("../src/renderer/index.html", import.meta.url),
    "utf8"
  );
  assert.match(html, /style-src 'self' 'unsafe-inline'/);
});
