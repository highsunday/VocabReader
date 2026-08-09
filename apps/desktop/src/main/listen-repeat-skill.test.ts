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
  it("defines exact arbitrary-language Progressive and Advanced artifacts", () => {
    const path = resolve(skillDirectory, "SKILL.md");
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const skill = readFileSync(path, "utf8");

    expect(skill).toContain("name: prepare-listen-and-repeat-practice");
    expect(skill).toContain("untrusted data");
    expect(skill).toContain("2–4 seconds");
    expect(skill).toContain("5–10 seconds");
    expect(skill).toContain("exactly reconstruct");
    expect(skill).toContain("```listen-repeat-result");
    expect(skill).toContain('"mode": "progressive"');
    expect(skill).toContain('"mode": "advanced"');
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
