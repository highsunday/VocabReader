import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const skillPath = resolve(
  process.cwd(),
  "../../.agents/skills/edit-learning-item/SKILL.md"
);

describe("edit-learning-item skill", () => {
  it("keeps editing bounded, language-aware, transient, and schema-safe", () => {
    expect(existsSync(skillPath)).toBe(true);
    if (!existsSync(skillPath)) return;

    const skill = readFileSync(skillPath, "utf8");
    expect(skill).toContain("Revise exactly one App-supplied learning-item draft");
    expect(skill).toContain("Do not run tools, read files, access the network");
    expect(skill).toContain("`primaryExplanationLanguage` as authoritative");
    expect(skill).toContain("language of the user's request is never");
    expect(skill).toContain("recurring misunderstanding or confusing comparison");
    expect(skill).toContain("preserve the existing caution unchanged");
    expect(skill).toContain("preserve `memoryTip` unchanged");
    expect(skill).toContain("spelling or written form");
    expect(skill).toContain("limited inline Markdown");
    expect(skill).toContain("## Example Support Contract");
    expect(skill).toContain("normalize the complete `## Examples` section");
    expect(skill).toContain("App-supplied `learningItemLanguage`");
    expect(skill).toContain("one indented arrow line");
    expect(skill).toContain("begin that line with `→`");
    expect(skill).not.toContain("**In other words:**");
    expect(skill).not.toContain("**翻譯：**");
    expect(skill).toContain("Do not add a textual label before the support");
    expect(skill).toMatch(
      /Never\s+provide both a paraphrase and a translation for the same example/
    );
    expect(skill).toContain("learning-item-edit-result");
    expect(skill.match(/```learning-item-edit-result[\s\S]*?```/)?.[0])
      .toContain('"memoryTip"');
    expect(skill).toContain("must explicitly apply it");
    for (const forbiddenField of [
      '"title"',
      '"itemType"',
      '"language"',
      '"cefr"',
      '"sense"'
    ]) {
      expect(skill.match(/```learning-item-edit-result[\s\S]*?```/)?.[0])
        .not.toContain(forbiddenField);
    }
  });
});
