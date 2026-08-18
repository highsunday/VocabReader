import assert from "node:assert/strict";
import JSZip from "jszip";
import { test } from "vitest";
import { ChatController } from "../src/main/chat-controller";
import { SpawnedCodexAppServerClient } from "../src/main/codex-app-server-client";
import { InMemoryEpubLibrary } from "../src/main/epub-library";
import { extractReadingSegment } from "../src/renderer/reading-range";
import { createFakeCodexAppServer } from "./fake-codex-app-server";

async function minimalEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?>
    <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
      <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
    </container>`);
  zip.file("EPUB/package.opf", `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Thinking in Systems</dc:title>
        <dc:creator>Example Author</dc:creator>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
        <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="chapter"/></spine>
    </package>`);
  zip.file("EPUB/nav.xhtml", `<?xml version="1.0"?>
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
      <body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Feedback Loops</a></li></ol></nav></body>
    </html>`);
  zip.file("EPUB/chapter.xhtml", `<?xml version="1.0"?>
    <html xmlns="http://www.w3.org/1999/xhtml"><body>
      <h1>Feedback Loops</h1>
      <p>Before secret. Inside concept. After hidden.</p>
      <script>never execute</script>
    </body></html>`);
  zip.file("EPUB/cover.png", Buffer.from([137, 80, 78, 71]));
  return zip.generateAsync({ type: "nodebuffer" });
}

async function waitUntil(check: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for fake Codex.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("imports an EPUB and sends only the START/END segment through a real Codex transport", async () => {
  const library = new InMemoryEpubLibrary();
  const imported = await library.importFromBuffer(await minimalEpub());
  assert.notEqual(imported.status, "cancelled");
  if (imported.status === "cancelled") return;
  assert.equal(imported.book.title, "Thinking in Systems");
  assert.match(imported.book.coverDataUrl ?? "", /^data:image\/png;base64,/);
  assert.equal(imported.book.chapters[0]?.title, "Feedback Loops");

  const chapter = await library.getChapterContent(
    imported.book.id,
    imported.book.chapters[0]!.id
  );
  assert.doesNotMatch(chapter.contentHtml, /script|never execute/i);
  const chapterText = chapter.contentHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const start = chapterText.indexOf("Inside concept.");
  const end = start + "Inside concept.".length;
  const selected = extractReadingSegment(chapterText, { start, end });
  assert.equal(selected, "Inside concept.");

  const fake = createFakeCodexAppServer();
  const controller = new ChatController({
    createClient: () => new SpawnedCodexAppServerClient({
      spawnProcess: () => fake.child
    }),
    workingDirectory: "/tmp/reader-ai-range-chat-smoke"
  });
  const connected = await controller.connect();
  assert.equal(connected.connection, "ready");
  assert.equal(connected.allowance.fiveHour?.remainingPercent, 75);
  assert.equal(connected.allowance.weekly?.remainingPercent, 62);
  await controller.sendMessage({
    text: "What is the key idea?",
    context: {
      bookTitle: imported.book.title,
      chapterTitle: imported.book.chapters[0]!.title,
      readingSegment: selected
    }
  });
  await waitUntil(() => controller.getSnapshot().activeTurnId === null);
  await controller.sendMessage({ text: "Why does it matter?" });
  await waitUntil(() => controller.getSnapshot().activeTurnId === null);

  const threadStarts = fake.requests.filter(({ method }) => method === "thread/start");
  const turns = fake.requests.filter(({ method }) => method === "turn/start");
  assert.equal(threadStarts.length, 1);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]?.params?.threadId, "reader-thread-1");
  assert.equal(turns[1]?.params?.threadId, "reader-thread-1");
  const firstInput = (turns[0]?.params?.input as Array<{ text: string }>)[0]!.text;
  assert.match(firstInput, /Thinking in Systems/);
  assert.match(firstInput, /Feedback Loops/);
  assert.match(firstInput, /Inside concept\./);
  assert.doesNotMatch(firstInput, /Before secret|After hidden/);
  assert.deepEqual(
    controller.getSnapshot().messages.map(({ role, status }) => [role, status]),
    [
      ["user", "completed"],
      ["assistant", "completed"],
      ["user", "completed"],
      ["assistant", "completed"]
    ]
  );
  controller.close();
});
