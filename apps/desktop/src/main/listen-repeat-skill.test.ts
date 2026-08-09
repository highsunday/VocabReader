import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { installBundledListenRepeatSkill } from "./bundled-skill";

const skillDirectory = resolve(
  process.cwd(),
  "../../.agents/skills/prepare-listen-and-repeat-practice"
);

describe("prepare-listen-and-repeat-practice skill", () => {
  it("defines compact boundary-only Progressive and Advanced results", () => {
    const path = resolve(skillDirectory, "SKILL.md");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const skill = readFileSync(path, "utf8");
    const normalizedSkill = skill.replace(/\s+/g, " ");

    expect(skill).toContain("name: prepare-listen-and-repeat-practice");
    expect(skill).toContain("untrusted data");
    expect(skill).toContain("0.75–1.5 seconds");
    expect(skill).toContain("extend to approximately 2 seconds only");
    expect(normalizedSkill).toContain("shortest independently repeatable semantic or breath group");
    expect(normalizedSkill).toContain("not merge two independently repeatable short groups");
    expect(normalizedSkill).toContain("prefer 1–4 lexical words");
    expect(normalizedSkill).toContain("Avoid five or more lexical words");
    expect(normalizedSkill).toContain("Never choose a short or long boundary that leaves punctuation");
    expect(normalizedSkill).toContain("Keep closing punctuation with the preceding spoken text");
    expect(skill).toContain("5–10 seconds");
    expect(skill).toContain("numbered units");
    expect(skill).toContain("longBreakEnds");
    expect(skill).toContain("shortBreakEnds");
    expect(skill).toContain("Do not repeat");
    expect(skill).toContain('"mode":"progressive"');
    expect(skill).toContain('"mode":"advanced"');
    expect(skill).not.toContain("```listen-repeat-result");
    expect(skill).not.toContain("translate the material");
  });

  it("installs into the controlled Codex runtime", () => {
    const runtime = mkdtempSync(resolve(tmpdir(), "listen-repeat-runtime-"));
    const installed = installBundledListenRepeatSkill(
      runtime,
      "bounded listen-and-repeat instructions"
    );
    expect(installed.path).toBe(resolve(
      runtime,
      ".agents/skills/prepare-listen-and-repeat-practice/SKILL.md"
    ));
    rmSync(runtime, { recursive: true, force: true });
  });
});
