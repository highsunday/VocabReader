import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { AccountSettings, App } from "../src/renderer/App";

test("the reader shell has no language-learning navigation", () => {
  const markup = renderToStaticMarkup(<App />);
  assert.match(markup, /Import EPUB/);
  assert.match(markup, /Settings/);
  assert.doesNotMatch(
    markup,
    /Review|Sentence Practice|Listen &amp; Repeat|Learning Library/
  );
});

test("Settings contains only the connected Codex Account", () => {
  const markup = renderToStaticMarkup(
    <AccountSettings
      snapshot={{
        connection: "ready",
        connectionDetail: "Connected as reader@example.com",
        account: { type: "chatgpt", email: "reader@example.com" },
        threadId: null,
        activeTurnId: null,
        messages: []
      }}
      onReconnect={() => undefined}
      onClose={() => undefined}
    />
  );
  assert.match(markup, /Account/);
  assert.match(markup, /reader@example\.com/);
  assert.match(markup, /Reconnect Codex/);
  assert.doesNotMatch(markup, /General|Voice|Review|Sentence Practice/);
});
