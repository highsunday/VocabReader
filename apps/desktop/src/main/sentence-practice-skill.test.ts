import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const skillPath = resolve(
  process.cwd(),
  "../../.agents/skills/practice-integrated-sentences/SKILL.md"
);

describe("practice-integrated-sentences skill", () => {
  it("requires example sentences to be plain and easy to imitate", () => {
    expect(existsSync(skillPath)).toBe(true);
    if (!existsSync(skillPath)) return;

    const skill = readFileSync(skillPath, "utf8");
    const exampleGeneration = skill.split("## Step 1")[0];
    expect(exampleGeneration).toContain("simple, everyday language");
    expect(exampleGeneration).toContain("easy for a learner to imitate");
    expect(exampleGeneration).toContain("simplest common words");
    expect(exampleGeneration).toContain("one short sentence");
    expect(exampleGeneration).toContain("literary scene-setting");
    expect(exampleGeneration).toContain("stacked subordinate clauses");
    expect(exampleGeneration).toContain(
      "does not make the surrounding language advanced"
    );
    expect(exampleGeneration).toContain(
      "A short, simple target-language example"
    );
    expect(exampleGeneration).not.toContain("story or short passage");
  });
});
