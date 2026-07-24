import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const skillPath = resolve(
  process.cwd(),
  "../../.agents/skills/practice-spaced-review/SKILL.md"
);

describe("practice-spaced-review skill", () => {
  it("improves the learner's wording without treating answer length as a problem", () => {
    expect(existsSync(skillPath)).toBe(true);
    if (!existsSync(skillPath)) return;

    const skill = readFileSync(skillPath, "utf8");
    expect(skill).toContain("expressionFeedback");
    expect(skill).toContain('"status": "improvable"');
    expect(skill).toContain('"suggestedAnswer"');
    expect(skill).toContain(
      "Expression quality must never raise or lower the semantic rating"
    );
    expect(skill).toContain(
      "Use the learning target's language for `suggestedAnswer`"
    );
    expect(skill).toContain(
      "Use `answerLanguage` for the expression feedback message"
    );
    expect(skill).toContain("`not-applicable`");
    expect(skill).toContain(
      "Answer length alone is never an expression-quality issue"
    );
    expect(skill).toMatch(
      /Never ask for a complete sentence, more\s+sentences, or a longer explanation/
    );
    expect(skill).not.toContain("`insufficient`");
    expect(skill).not.toContain("invites a fuller explanation");
  });

  it("models a concise next answer without reusing wrong semantic content", () => {
    expect(existsSync(skillPath)).toBe(true);
    if (!existsSync(skillPath)) return;

    const skill = readFileSync(skillPath, "utf8");
    expect(skill).toContain("one non-empty `recommendedAnswer` for every question");
    expect(skill).toMatch(
      /preserve its approachable\s+wording or structure and take it one small step further/
    );
    expect(skill).toMatch(
      /Do not\s+reuse the learner's incorrect semantic content/
    );
    expect(skill).toContain(
      "Do not write an exhaustive dictionary definition"
    );
    expect(skill).toContain('"recommendedAnswer"');
  });
});
