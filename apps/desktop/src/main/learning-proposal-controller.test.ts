import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SpawnedCodexAppServerClient } from "./codex-app-server-client";
import { createFakeCodexAppServer } from "./fake-codex-app-server";
import { LocalLearningLibrary } from "./learning-library-service";
import { LearningProposalController } from "./learning-proposal-controller";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "lingoshelf-proposal-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

const input = {
  bookId: "book-1",
  bookTitle: "The First Book",
  chapterId: "chapter-1",
  chapterTitle: "Opening",
  readingSegment: "A reluctant guest left early. A sentence annotation stays excluded.",
  explanationLanguage: "zh-TW" as const,
  sources: [
    { annotationId: "a-word", annotationText: "reluctant", startOffset: 2, endOffset: 10, sourceSentence: "A reluctant guest left early." },
    { annotationId: "a-phrase", annotationText: "left early", startOffset: 17, endOffset: 27, sourceSentence: "A reluctant guest left early." }
  ]
};

function candidateResponse() {
  return JSON.stringify({
    candidates: [
      {
        annotationId: "a-word", displayForm: "reluctant", canonicalForm: "reluctant",
        itemType: "word", aliases: ["unwilling"], partOfSpeech: "adjective",
        contextualMeaning: "不情願的", conciseExplanation: "不願意做某事",
        cefr: "B2", pronunciation: "/rɪˈlʌktənt/", collocationNotes: "reluctant to + verb"
      },
      {
        annotationId: "a-phrase", displayForm: "left early", canonicalForm: "leave early",
        itemType: "phrase", aliases: ["leave early"], partOfSpeech: null,
        contextualMeaning: "提早離開", conciseExplanation: "在預定結束前離開",
        cefr: "A2", pronunciation: null, collocationNotes: null
      }
    ]
  });
}

describe("LearningProposalController", () => {
  it("uses two output-schema turns, bounded programmatic candidates and returns reviewable diffs without persistence", async () => {
    const directory = await temporaryDirectory();
    const library = new LocalLearningLibrary(join(directory, "learning.sqlite"));
    const existing = await library.createDraft({
      bookId: input.bookId, bookTitle: input.bookTitle, chapterId: input.chapterId,
      chapterTitle: input.chapterTitle,
      annotation: { id: "existing-source", start: 2, end: 10, text: "reluctant" },
      sourceSentence: input.sources[0].sourceSentence
    });
    const before = await library.listItems({ status: "active" });
    const fake = createFakeCodexAppServer({
      turnResponses: [candidateResponse(), JSON.stringify({
        proposals: [
          { annotationId: "a-word", action: "update", existingItemId: existing.item.id },
          { annotationId: "a-phrase", action: "create", existingItemId: null }
        ]
      })]
    });
    const controller = new LearningProposalController({
      createClient: () => new SpawnedCodexAppServerClient({ spawnProcess: () => fake.child }),
      library,
      workingDirectory: directory,
      skillPath: "/runtime/.agents/skills/generate-learning-cards/SKILL.md",
      skillInstructions: "Generate learning-card candidates only."
    });

    const result = await controller.generate(input);

    expect(result.proposals).toEqual([
      expect.objectContaining({
        action: "update", source: expect.objectContaining({ annotationId: "a-word" }),
        existingItem: expect.objectContaining({ id: existing.item.id }),
        fieldDiffs: expect.arrayContaining([expect.objectContaining({ field: "conciseExplanation" })])
      }),
      expect.objectContaining({ action: "create", existingItem: null })
    ]);
    expect(await library.listItems({ status: "active" })).toEqual(before);
    const turns = fake.requests.filter((request) => request.method === "turn/start");
    expect(turns).toHaveLength(2);
    expect(turns.every((turn) => typeof turn.params?.outputSchema === "object")).toBe(true);
    expect(JSON.stringify(turns[0]?.params)).not.toContain("a-sentence");
    expect(JSON.stringify(turns[1]?.params)).toContain(existing.item.id);
    const thread = fake.requests.find((request) => request.method === "thread/start");
    expect(thread?.params).toMatchObject({ approvalPolicy: "never", environments: [], ephemeral: true });
    expect(thread?.params?.dynamicTools).toEqual([]);
    controller.close();
  });

  it.each([
    JSON.stringify({ proposals: [{ annotationId: "a-word", action: "delete", existingItemId: null }] }),
    JSON.stringify({ proposals: [{ annotationId: "outside", action: "create", existingItemId: null }] }),
    JSON.stringify({ proposals: [{ annotationId: "a-word", action: "update", existingItemId: "unknown" }] }),
    "not-json"
  ])("rejects untrusted proposal output without persistence: %s", async (invalid) => {
    const directory = await temporaryDirectory();
    const library = new LocalLearningLibrary(join(directory, "learning.sqlite"));
    const before = await library.listItems({ status: "active" });
    const fake = createFakeCodexAppServer({ turnResponses: [candidateResponse(), invalid] });
    const controller = new LearningProposalController({
      createClient: () => new SpawnedCodexAppServerClient({ spawnProcess: () => fake.child }),
      library, workingDirectory: directory, skillPath: "/runtime/skill.md", skillInstructions: "fixed"
    });

    await expect(controller.generate(input)).rejects.toThrow(/提案|JSON|action|來源|項目/);
    expect(await library.listItems({ status: "active" })).toEqual(before);
    controller.close();
  });

  it("waits for valid structured turn completion that arrives after one second", async () => {
    const directory = await temporaryDirectory();
    const library = new LocalLearningLibrary(join(directory, "learning.sqlite"));
    const fake = createFakeCodexAppServer({
      turnDelayMs: 1_500,
      turnResponses: [candidateResponse(), JSON.stringify({
        proposals: [
          { annotationId: "a-word", action: "create", existingItemId: null },
          { annotationId: "a-phrase", action: "create", existingItemId: null }
        ]
      })]
    });
    const controller = new LearningProposalController({
      createClient: () => new SpawnedCodexAppServerClient({ spawnProcess: () => fake.child }),
      library, workingDirectory: directory, skillPath: "/runtime/skill.md", skillInstructions: "fixed"
    });

    await expect(controller.generate(input)).resolves.toEqual({
      proposals: expect.arrayContaining([
        expect.objectContaining({ action: "create", source: expect.objectContaining({ annotationId: "a-word" }) }),
        expect.objectContaining({ action: "create", source: expect.objectContaining({ annotationId: "a-phrase" }) })
      ])
    });
    controller.close();
  }, 6_000);
});
