import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rendererFiles = [
  "App.tsx",
  "LearningItemDraftDialog.tsx",
  "LearningLibraryWorkspace.tsx",
  "ReadingPracticePaper.tsx",
  "SpacedReviewWorkspace.tsx"
];

describe("English GUI", () => {
  it.each(rendererFiles)("%s contains no Han-script GUI copy", (fileName) => {
    const source = readFileSync(resolve(__dirname, fileName), "utf8");

    expect(source.match(/\p{Script=Han}/gu) ?? []).toEqual([]);
  });
});
