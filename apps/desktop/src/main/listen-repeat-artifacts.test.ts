import { describe, expect, it } from "vitest";
import {
  parseListenRepeatArtifact,
  unitizeListenRepeatMaterial
} from "./listen-repeat-artifacts";

function artifact(value: unknown) {
  return JSON.stringify(value);
}

describe("listen-and-repeat artifacts", () => {
  it("builds Advanced chunks locally from ordered unit boundaries", () => {
    const material = "Hello world.";
    const result = parseListenRepeatArtifact(artifact({
      version: 3,
      practiceId: "practice-1",
      mode: "advanced",
      longBreakEnds: [2]
    }), { practiceId: "practice-1", mode: "advanced", material });

    expect(result.longChunks).toEqual([
      { text: "Hello ", shortChunks: [] },
      { text: "world.", shortChunks: [] }
    ]);
    expect(result.longChunks.map(({ text }) => text).join(""))
      .toBe(material);
  });

  it("builds Progressive children locally from parent-scoped unit boundaries", () => {
    const material = "I came, I saw.";
    const result = parseListenRepeatArtifact(artifact({
      version: 3,
      practiceId: "practice-2",
      mode: "progressive",
      longBreakEnds: [],
      shortBreakEnds: [5]
    }), { practiceId: "practice-2", mode: "progressive", material });

    expect(result.longChunks[0]).toEqual({
      text: material,
      shortChunks: [
        { text: "I came, " },
        { text: "I saw." }
      ]
    });
  });

  it("coalesces punctuation-only boundaries instead of creating practice cards", () => {
    const material = "Repeat this.";
    const punctuationBoundary = unitizeListenRepeatMaterial(material).length - 1;
    const progressive = parseListenRepeatArtifact(artifact({
      version: 3,
      practiceId: "practice-punctuation-progressive",
      mode: "progressive",
      longBreakEnds: [],
      shortBreakEnds: [punctuationBoundary]
    }), {
      practiceId: "practice-punctuation-progressive",
      mode: "progressive",
      material
    });
    const advanced = parseListenRepeatArtifact(artifact({
      version: 3,
      practiceId: "practice-punctuation-advanced",
      mode: "advanced",
      longBreakEnds: [punctuationBoundary]
    }), {
      practiceId: "practice-punctuation-advanced",
      mode: "advanced",
      material
    });

    expect(progressive.longChunks).toEqual([{
      text: material,
      shortChunks: [{ text: material }]
    }]);
    expect(advanced.longChunks).toEqual([{
      text: material,
      shortChunks: []
    }]);
  });

  it("preserves arbitrary-language code units while slicing only from numeric boundaries", () => {
    const material = "Cafe\u0301 👨‍👩‍👧‍👦。\n再見。";
    const whole = parseListenRepeatArtifact(artifact({
      version: 3,
      practiceId: "practice-unicode",
      mode: "advanced",
      longBreakEnds: []
    }), {
      practiceId: "practice-unicode",
      mode: "advanced",
      material
    });

    expect(whole.longChunks).toEqual([{ text: material, shortChunks: [] }]);
  });

  it("adds the canonical final boundary locally when AI only returns interior breaks", () => {
    const material = `${Array.from({ length: 101 }, (_, index) =>
      `word${index}`).join(" ")}.`;
    expect(unitizeListenRepeatMaterial(material)).toHaveLength(202);

    const result = parseListenRepeatArtifact(artifact({
      version: 3,
      practiceId: "practice-final-boundary",
      mode: "progressive",
      longBreakEnds: [54, 99, 128, 158, 200],
      shortBreakEnds: [9, 24, 37, 54, 75, 87, 99, 114, 128, 138, 158, 170, 183, 200]
    }), {
      practiceId: "practice-final-boundary",
      mode: "progressive",
      material
    });

    expect(result.longChunks.map(({ text }) => text).join(""))
      .toBe(material);
    expect(result.longChunks.at(-1)?.text).toContain("word100.");
    expect(result.longChunks.at(-1)?.shortChunks.map(({ text }) => text).join(""))
      .toBe(result.longChunks.at(-1)?.text);
  });

  it("rejects out-of-range, repeated and reversed interior boundaries", () => {
    const advanced = {
      practiceId: "practice-3",
      mode: "advanced" as const,
      material: "Keep every space."
    };
    const progressive = { ...advanced, mode: "progressive" as const };

    for (const longBreakEnds of [
      [0],
      [2, 2],
      [3, 2],
      [99],
      [unitizeListenRepeatMaterial(advanced.material).length]
    ]) {
      expect(() => parseListenRepeatArtifact(artifact({
        version: 3,
        practiceId: advanced.practiceId,
        mode: advanced.mode,
        longBreakEnds
      }), advanced)).toThrow(/boundar|scope/i);
    }

    for (const shortBreakEnds of [
      [0],
      [2, 2],
      [3, 2],
      [99],
      [unitizeListenRepeatMaterial(progressive.material).length]
    ]) {
      expect(() => parseListenRepeatArtifact(artifact({
        version: 3,
        practiceId: progressive.practiceId,
        mode: progressive.mode,
        longBreakEnds: [],
        shortBreakEnds
      }), progressive)).toThrow(/boundar|short|scope/i);
    }
  });

  it("rejects mismatched scope, source-text fields and fenced or duplicate results", () => {
    const options = {
      practiceId: "practice-4",
      mode: "advanced" as const,
      material: "One result."
    };
    const base = {
      version: 3,
      practiceId: options.practiceId,
      mode: options.mode,
      longBreakEnds: []
    };

    expect(() => parseListenRepeatArtifact(artifact({
      ...base,
      practiceId: "wrong"
    }), options)).toThrow(/scope/i);
    expect(() => parseListenRepeatArtifact(artifact({
      ...base,
      text: options.material
    }), options)).toThrow(/boundar|field|scope/i);
    expect(() => parseListenRepeatArtifact(
      `\`\`\`listen-repeat-result\n${artifact(base)}\n\`\`\``,
      options
    )).toThrow(/JSON|result/i);
    expect(() => parseListenRepeatArtifact(
      `${artifact(base)}${artifact(base)}`,
      options
    )).toThrow(/JSON|result/i);
  });
});
