import { describe, expect, it } from "vitest";
import { parseListenRepeatArtifact } from "./listen-repeat-artifacts";

function artifact(value: unknown) {
  return `\n\`\`\`listen-repeat-result\n${JSON.stringify(value)}\n\`\`\`\n`;
}

describe("listen-and-repeat artifacts", () => {
  it("accepts Advanced long chunks only when they exactly reconstruct material", () => {
    const material = "Hello, world.\n再見。";
    const result = parseListenRepeatArtifact(artifact({
      version: 1,
      practiceId: "practice-1",
      mode: "advanced",
      longChunks: [
        { text: "Hello, world.\n" },
        { text: "再見。" }
      ]
    }), { practiceId: "practice-1", mode: "advanced", material });

    expect(result.longChunks).toEqual([
      { text: "Hello, world.\n", shortChunks: [] },
      { text: "再見。", shortChunks: [] }
    ]);
  });

  it("accepts Progressive children only when each parent and the material reconstruct exactly", () => {
    const material = "I came, I saw. 我來了。";
    const result = parseListenRepeatArtifact(artifact({
      version: 1,
      practiceId: "practice-2",
      mode: "progressive",
      longChunks: [{
        text: material,
        shortChunks: ["I came, ", "I saw. ", "我來了。"]
      }]
    }), { practiceId: "practice-2", mode: "progressive", material });

    expect(result.longChunks[0].shortChunks.map(({ text }) => text)).toEqual([
      "I came, ",
      "I saw. ",
      "我來了。"
    ]);
  });

  it("rejects rewritten, missing, empty, reordered, mixed-mode and duplicate fences", () => {
    const options = {
      practiceId: "practice-3",
      mode: "progressive" as const,
      material: "Keep  every space."
    };
    const base = {
      version: 1,
      practiceId: options.practiceId,
      mode: options.mode,
      longChunks: [{
        text: options.material,
        shortChunks: ["Keep  ", "every space."]
      }]
    };

    expect(() => parseListenRepeatArtifact(artifact({
      ...base,
      longChunks: [{ text: "Keep every space.", shortChunks: ["Keep ", "every space."] }]
    }), options)).toThrow(/reconstruct/i);
    expect(() => parseListenRepeatArtifact(artifact({
      ...base,
      longChunks: [{ text: options.material, shortChunks: ["", options.material] }]
    }), options)).toThrow(/empty/i);
    expect(() => parseListenRepeatArtifact(artifact({
      ...base,
      longChunks: [{ text: options.material, shortChunks: ["every space.", "Keep  "] }]
    }), options)).toThrow(/reconstruct/i);
    expect(() => parseListenRepeatArtifact(artifact({ ...base, mode: "advanced" }), options))
      .toThrow(/scope/i);
    expect(() => parseListenRepeatArtifact(`${artifact(base)}${artifact(base)}`, options))
      .toThrow(/exactly one/i);
  });
});
